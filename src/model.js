import { parseAuth, parseDomainOrIPv4Address, printHost, isLocalHost } from './authority.js'
import { pct, _encodeSets as S } from './characters.js'
import { isDottedSegment } from './parser.js'

const { setPrototypeOf:setProto, assign } = Object
const log = console.log.bind (console)


// URL Model
// =========

// URLs are ordered sequences of components, where the components are
// ordered by their component-type as follows.

const componentTypes =
  { scheme:1, auth:2, drive:3, root:4, dir:5, file:6, query:7, hash:8 }

// All components are optional, but if an URL has a host or a drive, and it also
// has one or more dir or file components, then it must also have a root component.

// This implementation uses javascript _objects_ with optional attributes.
// The dir components are collected into a nonempty `dirs`-_array_ and the
// authority subcomponents are assigned directly on the object itself as
// `user`, `pass`, `host` and `port`. 

// The empty authority is represented by setting the `host` attribute to the
// empty string. Otherwise the `host` is either an URLIPv6Address, an
// URLIPV4Address, an URLDomainName, or an opaque host string.


// Options and Modes
// ------------------

// A configuration, or a 'mode' is a collection of settings that affect parsing
// and resolution of URLs. Each setting specifies a boolean value for some
// optional behaviour; these options are not (yet) part of a public API.
// Instead, four pre-defined configurations are made avaialbale:
// web, file, generic and noscheme.

// ### Options

const options = {
  hierPart:     1 << 0, // Resolved URL must have an authority and hierarchical path
  plainAuth:    1 << 1, // Resolved URL must not have credentials nor a port
  stealAuth:    1 << 2, // Resolved URL must have a non-empty authority; take from path o/w
  parseDomain:  1 << 3, // Resolved URL host must not be an opaque host
  nonStrict:    1 << 4, // Use non-strict reference transformation
  winDrive:     1 << 5, // Detect windows drive letters
  winSlash:     1 << 6, // Convert \ before query as /
  specialQuery: 1 << 7, // encode ' in query
  default:      0,
}

// ### Configurations

const o = options // for brevity
const _special = o.hierPart | o.winSlash | o.nonStrict | o.specialQuery

const modes = {
  file:     _special | o.parseDomain | o.plainAuth | o.winDrive,
  web:      _special | o.parseDomain | o.stealAuth,
  noscheme: _special | o.winDrive,
  generic:  o.default,
}

// The `modeFor` function returns a configuration of options for a given
// URL object, based on its scheme. The configuration to be used for
// schemeless URLs can be manually overridden by specifying a fallback mode.

const specialSchemes = {
  http:  modes.web,
  https: modes.web,
  ws:    modes.web,
  wss:   modes.web,
  ftp:   modes.web,
  file:  modes.file,
}

const defaultPorts = {
  http: 80,
  https: 443,
  ws: 80,
  wss: 443,
  ftp: 21,
}

const modeFor = (url, fallback = modes.noscheme) =>
  ( url.scheme ? specialSchemes [low (url.scheme)] ?? modes.generic
  : url.drive ? modes.file
  : fallback )

const low = str =>
  str ? str.toLowerCase () : str



// Order and Upto
// --------------

// "The 'order of an URL' is the type of its first component, or
// fragment (here: hash) if the URL is the empty URL".

// The `ord` function returns the order of an URL.

const T = componentTypes

function ord (url) {
  return url.scheme    ? T.scheme
    : url.host != null ? T.auth
    : url.drive        ? T.drive
    : url.root         ? T.root
    : url.dirs != null ? T.dir
    : url.file         ? T.file
    : url.query        ? T.query
    : T.hash
}

const _attributeNames = {
  scheme: T.scheme,
  user:   T.auth,
  pass:   T.auth,
  host:   T.auth,
  port:   T.auth,
  drive:  T.drive,
  root:   T.root,
  dirs:   T.dir,
  file:   T.file,
  query:  T.query,
  hash:   T.hash
}

// The `upto` function returns a prefix of an URL. Specifically,
// it returns an URL that consists of all components that have
// a component-type < ord, and all dir components if
// dir ≤ ord.

function upto (url, ord) {
  const r = { }
  for (const k in _attributeNames)
    if (url[k] == null) continue
    else if (_attributeNames[k] < ord) r[k] = url[k]
    else if (_attributeNames[k] === ord && k === 'dirs')
      r[k] = url[k] .slice (0)
  return r
}



// Rebase
// ------

// The `pureRebase` function implements a generalised version of URL resolution
// that adds support for schemeless URLs. It does not implement the behaviour
// for special URLs as defined by the WHATWG, this is handled higher up.

function pureRebase (url, base) {
  const r = upto (base, ord (url))
  for (const k in _attributeNames)
    if (url[k] == null) continue
    else if (k === 'dirs')
      r.dirs = (r.dirs ?? []) .concat (url.dirs)
    else r[k] = url[k]
  /* Patch up root if needed */
  if ((r.host != null || r.drive) && (r.dirs || r.file))
    r.root = '/'
  return r
}

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

  if (modeFor (url) & o.nonStrict && schemesAreEquivalent (url.scheme, base.scheme))
    url = setProto ({ scheme:null }, url)

  if (url.scheme || isFragmentOnlyURL (url) || !hasOpaquePath (base))
    return pureRebase (url, base)

  else
    throw new RebaseError (url, base)
}

class RebaseError extends Error {
  constructor (url1, url2) {
    super (`Cannot rebase <${print(url1)}> onto <${print(url2)}>`)
  }
}



// Forcing, helpers
// ----------------

// Forced resolve makes use of the following
// helper functions:

function _firstNonEmptySegment (url) {
  const dirs = url.dirs ?? []
  for (let i=0, l=dirs.length; i<l;i++) if (dirs[i])
    return { value:dirs[i], ord:T.dir, index:i }
  if (url.file)
    return { value:url.file, ord:T.file }
  return null
}

function _removePrecedingSegments (url, match) {
  if (match.ord === T.dir) {
    const dirs_ = url.dirs.slice (match.index + 1)
    if (dirs_.length) url.dirs = dirs_
    else delete url.dirs
  }
  else if (match.ord === T.file) {
    delete url.dirs
    delete url.file
  }
  return url
}


// Reference Resolution
// --------------------

function resolve (input, base, _encodeOptions = {}) {

  const result =
    rebase (input, base)

  if (result.scheme == null)
    throw new ResolveError (input, base)

  const mode =
    modeFor (result)

  if (mode & o.stealAuth) {
    if (result.host == null || result.host === '') {
      const match = _firstNonEmptySegment (result)
      if (!match) throw new ResolveError (result)
      _removePrecedingSegments (result, match)
      assign (result, parseAuth (match.value))
    }
  }

  if (mode & o.plainAuth) {
    const { user, pass, port } = result
    if (user != null || pass != null || port != null)
      throw new Error (`Cannot resolve <${print(result)}>\n\t -A file URL must not have a username, password, or port\n`)
  }

  if (mode & o.hierPart) { 
    if (result.host == null) result.host = ''
    if (result.drive == null) result.root = '/'
  }

  // Convert opaque host to domain or IPv4 address
  if (mode & o.parseDomain && typeof result.host === 'string' && result.host.length)
    result.host = parseDomainOrIPv4Address (result.host)

  const { fixup = false, strict = false, unicode = false } = _encodeOptions
  return percentEncodeMut (normalizeMut (result), { fixup, strict, unicode })
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

function normalize (url, coded = true) {
  const result = assign ({}, url)
  return normalizeMut (result, coded)
}


function normalizeMut (r, coded = true) {

  // ### Scheme normalisation

  if (r.scheme)
    r.scheme = low (r.scheme)

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

  return r
}



// Percent Coding URLs
// -------------------

// NB: has no effect on URLDomainNames;
// Domain toASCII is deferred to a serialisation option.

function percentEncode (url, settings) {
  const result = assign ({}, url)
  return percentEncodeMut (result, settings)
}


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
    const querySet = config & o.specialQuery ? S.specialQuery : S.query
    r.query = pct.encode (r.query, querySet, settings)
  }

  if (r.hash != null)
    r.hash = pct.encode (r.hash, S.fragment, settings)

  return r
}



// URL Printing
// ------------

const isSchemeLike =
  /^([a-zA-Z][a-zA-Z+\-.]*):(.*)$/

function print (url, options) {
  const url_ = normalizeForPrinting (url, options)
  return unsafePrint (url_, options)
}

function normalizeForPrinting (url, options) {
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

  else if (modeFor (url) & o.winDrive && (position = _firstNonEmptySegment (url)) && isDriveString.exec (position.value)) {
    const value = position.value[0] + (position.value[1] === ':' ? '%3A' : '%7C')
    if (position.ord === componentTypes.file) url.file = value
    else url.dirs[position.index] = value
  }

  return url
}


// ### Printing the path of an URL

const pathname = ({ drive, root, dirs, file }, spec) =>
  print ({ drive, root, dirs, file }, spec)


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



// Predicates
// ----------

function schemesAreEquivalent (s1, s2) {
  if (s1 == null || s2 == null) return false
  const len = s1.length
  let r = len === s2.length
  for (let i=0; r && i<len; i++)
    r = (s1.charCodeAt(i) | 32) === (s2.charCodeAt(i) | 32)
  return r
}

function isFragmentOnlyURL (url) {
  return url.hash != null && ord (url) === T.hash
}

// Note: opaque-paths are currently not modeled by using a 
// separate *opaque-path* component-type. Instead they are
// detected by looking at the shape of the URL as follows.

function hasOpaquePath (url) {
  return !(modeFor (url) & o.hierPart) &&
    url.root == null &&
    url.host == null
}



// Exports
// -------

export {

  componentTypes,
  options,
  modes,
  modeFor,

  ord,
  upto,
  rebase,
  resolve,
  normalize,
  normalizeMut,
  percentEncode,
  percentEncodeMut,
  unsafePrint,
  pathname,
  print,

  low,
  schemesAreEquivalent,
  isFragmentOnlyURL,
  hasOpaquePath,

  _firstNonEmptySegment,
  _removePrecedingSegments,

}