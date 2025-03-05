import { utf8, pct, _encodeSets as S } from './characters.js'
import { parse, parsePath, isDottedSegment } from './parser.js'

import {
  URLIPv6Address, URLDomainName, URLIPv4Address,
  parseAuth, parsePort, parseHost, parseDomainOrIPv4Address,
  printHost, isLocalHost, ipv6, ipv4
} from './authority.js'

import {
  options as opts, modes, modeFor,
  componentTypes, ord, upto, pureRebase,
  schemesAreEquivalent, isFragmentOnlyURL, normaliseScheme,
  _attributeNames, _firstNonEmptySegment, _removePrecedingSegments,
} from './model.js'

const { setPrototypeOf:setProto, assign } = Object
const log = console.log.bind (console)


// Rebase
// ------

// The `rebase` function is a generalisation of the URL resolution behaviour
// that is implicitly specified by the WHATWG. It makes the same distinctions
// between file-, web- and opaque-path URLs as the WHATWG standard does, but
// also supports schemeless URLs.

// It uses what RFC3986 calls the 'non-strict' transformation of
// references (section 5.2) for 'special' URLs: If the input has a scheme
// and the scheme is equivalent to the scheme of the base URL, then it is
// removed. It then continues with the 'strict' behaviour as implemented
// by the `pureRebase` function.

function rebase (url, base) {
  base = typeof base === 'string' ? parse (base) : (base ?? { })

  if (typeof url === 'string')
    url = parse (url, modeFor (base))

  if (modeFor (url) & opts.nonStrict && schemesAreEquivalent (url.scheme, base.scheme))
    url = setProto ({ scheme:null }, url)

  if (url.scheme || isFragmentOnlyURL (url) || !hasOpaquePath (base))
    return pureRebase (url, base)

  else
    throw new RebaseError (url, base)
}

function goto (base, url) {
  return rebase (url, base)
}

class RebaseError extends Error {
  constructor (url1, url2) {
    super (`Cannot rebase <${print(url1)}> onto <${print(url2)}>`)
  }
}

// Note: opaque-paths are currently not modeled by using a 
// separate *opaque-path* component-type. Instead they are
// detected by looking at the shape of the URL as follows.

const hasOpaquePath = url =>
  !(modeFor (url) & opts.hierPart) && url.root == null && url.host == null



// Reference Resolution
// --------------------

function resolve (input, base, _encodeOptions = {}) {

  const result =
    rebase (input, base)

  if (result.scheme == null)
    throw new ResolveError (input, base)

  const mode =
    modeFor (result)

  if (mode & opts.stealAuth) {
    if (result.host == null || result.host === '') {
      const match = _firstNonEmptySegment (result)
      if (!match) throw new ResolveError (result)
      _removePrecedingSegments (result, match)
      assign (result, parseAuth (match.value))
    }
  }

  if (mode & opts.plainAuth) {
    const { user, pass, port } = result
    if (user != null || pass != null || port != null)
      throw new Error (`Cannot resolve <${print(result)}>\n\t -A file URL must not have a username, password, or port\n`)
  }

  if (mode & opts.hierPart) { 
    if (result.host == null) result.host = ''
    if (result.drive == null) result.root = '/'
  }

  // Convert opaque host to domain or IPv4 address
  if (mode & opts.parseDomain && typeof result.host === 'string' && result.host.length)
    result.host = parseDomainOrIPv4Address (result.host)

  const { fixup = false, strict = false, unicode = false } = _encodeOptions
  return percentEncodeMut (normaliseMut (result), { fixup, strict, unicode })
}


class ResolveError extends TypeError {
  constructor (url1, url2) {
    if (url2 != null)
      super (`Cannot resolve <${print(url1)}> against <${print(url2)}>`)
    else
      super (`Cannot resolve <${print(url1)}>`)
  }
}


// Normalisation
// -------------

const defaultPorts =
  { http: 80, ws: 80, https: 443, wss: 443, ftp: 21 }

const normalise = (url, coded = true) =>
  normaliseMut (assign ({}, url), coded)

const validateOpaqueHost = input => {
 return pct.encode (input, S.opaqueHost, { fixup:false, strict:false })
}

function normaliseMut (r, coded = true) {

  // ### Scheme normalisation

  if (r.scheme)
    r.scheme = normaliseScheme (r.scheme)

  // ### Authority normalisation

  if (r.pass === '') delete r.pass
  if (!r.pass && r.user === '') delete r.user
  if (r.port === '') delete r.port

  // ### Drive letter normalisation

  if (r.drive) r.drive = r.drive[0] + ':'

  // ### Path segement normalisation

  if (hasOpaquePath (r) && r.dirs)
    r.dirs = r.dirs.slice ()

  else {
    const dirs = []
    for (const x of r.dirs ?? []) {
      switch (isDottedSegment (x, coded)) {
        case 0: dirs.push (x)
        case 1: continue
        case 2: 
          if (dirs.length && dirs[dirs.length-1] !== '..') dirs.pop ()
          else if (!r.root) dirs.push ('..')
      }
    }
    if (dirs.length) r.dirs = dirs
    else if (ord (r) === componentTypes.dir) r.dirs = ['.']
    else delete r.dirs
  }

  // ### Scheme-based authority normalisation

  if (r.scheme === 'file' && isLocalHost (r.host))
    r.host = ''

  else if (r.port === defaultPorts [r.scheme])
    delete r.port

  // for (const k in _attributeNames)
  //   if (r[k] == null) delete r[k]
  return r
}


// Percent Coding URLs
// -------------------
// NB: has no effect on URLDomainNames;
// Doman toASCII is deferred to a serialisation option.

const percentEncode = (url, settings) =>
  percentEncodeMut (assign ({}, url), settings)


function percentEncodeMut (r, settings) {
  if (r.user != null)
    r.user = pct.encode (r.user, S.user, settings)

  if (r.pass != null)
    r.pass = pct.encode (r.pass, S.pass, settings)

  if (r.host != null) {
    r.host = typeof r.host === 'string'
      ? pct.encode (r.host, S.opaqueHost, settings)
      : r.host
  }

  // opaque paths vs hierarchical paths
  const encodeSeg = hasOpaquePath (r) ? S.opaquePath : S.pathSegment

  if (r.dirs)
    r.dirs = r.dirs.map (x => pct.encode (x, encodeSeg, settings))

  if (r.file != null)
    r.file = pct.encode (r.file, encodeSeg, settings)

  if (r.query != null) {
    const config = modeFor (r)
    const querySet = config & opts.specialQuery ? S.specialQuery : S.query
    r.query = pct.encode (r.query, querySet, settings)
  }

  if (r.hash != null)
    r.hash = pct.encode (r.hash, S.fragment, settings)

  return r
}

// Percent decoding
// TODO consider doing puny decoding as well
// NB this is a bit dangerous to expose like this as the reuslt looks like 
// an URL object, but its components are not percent coded strings anymore

const _dont = { scheme:1, port:1, drive:1, root:1 }
const percentDecode = url => {
  const r = { }
  for (let k in _attributeNames) if (url[k] != null)
    r[k] = _dont [k] ? url[k]
      : k === 'dirs' ? url[k] .map (pct.decode)
      : typeof url[k] === 'string' ? pct.decode (url[k])
      : url[k]
  return r
}



// URL Printing
// ------------

const isSchemeLike =
  /^([a-zA-Z][a-zA-Z+\-.]*):(.*)$/

const isDriveLike =
  /^[a-zA-Z][:|]$/

// function isDriveLike (str) {
//   const a = str.charCodeAt(0) | 32
//   return (str[1] === ':' || str[1] === '|')
//     && 97 <= a && a <= 122
// }

function print (url, options) {
  const url_ = normaliseForPrinting (url, options)
  return unsafePrint (url_, options)
}

function normaliseForPrinting (url, options) {
  url = percentEncode (url, options)

  // prevent accidentally producing an authority or a path-root

  const authNorDrive = url.host == null && url.drive == null
  const emptyFirstDir = url.dirs && url.dirs[0] === ''

  if (authNorDrive && emptyFirstDir)
    url.dirs.unshift ('.')

  // prevent accidentally producing a scheme

  let match, position

  const o = ord (url)
  if (o === componentTypes.dir && (match = isSchemeLike.exec (url.dirs[0])))
    url.dirs[0] = match[1] + '%3A' + match[2]

  else if (o === componentTypes.file && (match = isSchemeLike.exec (url.file)))
    url.file = match[1] + '%3A' + match[2]

  // prevent accidentally producing a drive

  // TODO this still misses some cases.
  else if (modeFor (url) & o.winDrive && (position = _firstNonEmptySegment (url)) && isDriveLike.exec (position.value)) {
    const value = position.value[0] + (position.value[1] === ':' ? '%3A' : '%7C')
    if (position.ord === componentTypes.file) url.file = value
    else url.dirs[position.index] = value
  }

  return url
}


// ### Printing the path of an URL

const pathname = ({ drive, root, dirs, file }, spec) =>
  print ({ drive, root, dirs, file }, spec)

const filePath = ({ drive, root, dirs, file }) =>
  unsafePrint (percentDecode ({ drive, root, dirs, file }))
  // TODO consider throwing an error if a dir or a file contains '/'

// ### Printing prepared URLs

function unsafePrint (url, options) {
  let result = ''
  const hasCredentials = url.user != null
  for (const k in _attributeNames) if (url[k] != null) {
    const v = url[k]
    result +=
      k === 'scheme' ? ( v + ':') :
      k === 'user'   ? ('//' + v) :
      k === 'pass'   ? ( ':' + v) :
      k === 'host'   ? ((hasCredentials ? '@' : '//') + printHost (v, options)) :
      k === 'port'   ? (':' + v) :
      k === 'drive'  ? ('/' + v) :
      k === 'root'   ? ('/'    ) :
      k === 'dirs'   ? (v.join ('/') + '/') :
      k === 'file'   ? (v) :
      k === 'query'  ? ('?' + v) :
      k === 'hash'   ? ('#' + v) : ''
  }
  return result
}


// Exports
// =======

const version = '2.5.0-dev'
const unstable = { utf8, pct, percentEncodeMut, normaliseMut, encodeSets:S }

export {
  version,

  modes,
  modeFor,
  componentTypes,
  componentTypes as ords,
  ord,
  upto,
  pureRebase,
  hasOpaquePath,

  rebase, rebase as parseRebase, goto,
  resolve, resolve as parseResolve, resolve as WHATWGResolve,
  normalise, normalise as normalize,
  percentEncode,
  percentDecode,

  parse,
  parsePath,
  parseAuth,

  parseHost,
  printHost,

  URLIPv4Address,
  URLIPv6Address,
  URLDomainName,
  validateOpaqueHost,

  print,
  pathname,
  filePath,
  unsafePrint,

  ipv4,
  ipv6,
  unstable
}