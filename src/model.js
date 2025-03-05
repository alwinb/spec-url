const log = console.log.bind (console)

// URL Model
// =========

// URLs are ordered sequences of components, where the components are
// ordered by their component-type as follows.

const componentTypes =
  { scheme:1, auth:2, drive:3, root:4, dir:5, file:6, query:7, hash:8 }

// All components are optional, but if an URL has a host or a drive, and it also
// has one or more dir or file components, then it also has a root component.

// The implementation uses javascript _objects_ with optional attributes.
// The dir components are collected into a nonempty `dirs`-_array_ and the
// authority subcomponents are assigned directly on the object itself as
// `user`, `pass`, `host` and `port`. 

// The empty authority is represented by setting the `host` attribute to the
// empty string. Otherwise the `host` is either an URLIPv6Address, an
// URLIPV4Address, an URLDomainName, or an opaque host string.


// Modes
// -----

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
// that adds supports for schemeless URLs. It does not implement the behaviour
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


// Exports
// -------

export {

  options,
  modes,
  modeFor,

  componentTypes,
  _attributeNames,
 
  ord,
  upto,
  pureRebase,

  low,
  low as normaliseScheme,

  schemesAreEquivalent,
  isFragmentOnlyURL,
  _firstNonEmptySegment,
  _removePrecedingSegments,
}