import { parseHost } from './host.js'
import {
  options as o,
  componentTypes,
  modes,
  modeFor,
  low,
  _firstNonEmptySegment,
  _removePrecedingSegments,
} from './model.js'

const { assign } = Object
const log = console.log.bind (console)


// URL Parser
// ==========

// ## Character Classes

const CharClass = {
  Other: 0,
  Alpha: 1,
  SchemeOther: 2,
  Digit: 3,
  Colon: 4,
  Slash: 5,
  QuestionMark: 6,
  Hash: 7,
  AmbiSlash: 8, // I'm mapping \ here in non-special URLs, treated same as other
}

const eqClasses = new Uint8Array ([
//NUL SOH STX ETX EOT ENQ ACK BEL BS  HT  LF  VT  FF  CR  SO  SI
   0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
//DLE DC1 DC2 DC3 DC4 NAK SYN ETB CAN EM  SUB ESC FS  GS  RS  US
   0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
// SP  !   "   #   $   %   &   '   (   )   *   +   ,   -   .   /
   0,  0,  0,  7,  0,  0,  0,  0,  0,  0,  0,  2,  0,  2,  2,  5,
// 0   1   2   2   4   5   6   7   8   9   :   ;   <   =   >   ?
   3,  3,  3,  3,  3,  3,  3,  3,  3,  3,  4,  0,  0,  0,  0,  6,
// @   A   B   C   D   E   F   G   H   I   J   K   L   M   N   O
   0,  1,  1,  1,  1,  1,  1,  1,  1 , 1,  1,  1,  1,  1,  1,  1,
// P   Q   R   S   T   U   V   W   X   Y   Z   [   \   ]   ^   _
   1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  0,  5,  0,  0,  0, 
// '   a   b   c   d   e   f   g   h   i   j   k   l   m   n   o
   0,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1, 
// p   q   r   s   t   u   v   w   x   y   z   {   |   }   ~  DEL
   1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  0,  0,  0,  0, 0 ])

const cc_other = 0
const cc_count = 9

// Alternative lookup table for parsePath; where ? and # are 
// not considered to be delimiters:

const pathEqClasses = new Uint8Array(eqClasses)
pathEqClasses['?'.charCodeAt(0)] = cc_other
pathEqClasses['#'.charCodeAt(0)] = cc_other

// Non-special URLs do not handle \ as /
const nonSpecialEqClasses = new Uint8Array(eqClasses)
nonSpecialEqClasses['\\'.charCodeAt(0)] = CharClass.AmbiSlash //cc_other

const nonSpecialPathEqClasses = new Uint8Array(pathEqClasses)
nonSpecialEqClasses['\\'.charCodeAt(0)] = CharClass.AmbiSlash //cc_other


// ### States and Tokens

const State = {
  Fail: 0,
  Start: 1,
  AfterScheme: 2,
  AfterSpecialScheme: 3,
  AfterAuth: 4,
  RelativePath: 5,
  AfterFile: 6,
  Scheme: 7,
  Auth: 8,
  Root: 9,
  Dir: 10,
  File: 11,
  Query: 12,
  Hash: 13,
  RootNoAuth: 14,
  FileSchemeLike: 15,
  OpaquePath: 16,
}

// A state is accepting if state >= min_accepts
const min_accepts = State.Scheme

// stateNames is a lookup table 
// from state-id to a human readable name
const stateNames = []
for (const k in State)
  stateNames[State[k]] = k

// Abbreviate states
const T = State
const __ = State.Fail

// Transition table / DFA
// Colums corresponds to input character classes
// Rows correspond to input states
// Cells correspond to output state
// States are accepting if they are >= min_accepts

const dfa = new Uint8Array ([
//oth alp +-. dig  :  /   ?   #  ambi
  __, __, __, __, __, __, __, __, __, // 0: Fail
  11, 15, 11, 11, 11, 14, 12, 13, 11, // 1: Start
  16, 16, 16, 16, 16, 14, 12, 13, 16, // 2: AfterScheme
  11, 11, 11, 11, 11, 14, 12, 13, 11, // 3: AfterSpecialScheme
  11, 11, 11, 11, 11,  9, 12, 13, 11, // 4: AfterAuth
  11, 11, 11, 11, 11, 10, 12, 13, 11, // 5: RelativePath
  __, __, __, __, __, __, 12, 13, __, // 6: AfterFile
  __, __, __, __, __, __, __, __, __, // 7: Scheme
   8,  8,  8,  8,  8, __, __, __,  8, // 8: Auth
  __, __, __, __, __, __, __, __, __, // 9: Root
  __, __, __, __, __, __, __, __, __, // 10: Dir
  11, 11, 11, 11, 11, 10, __, __, 11, // 11: File
  12, 12, 12, 12, 12, 12, 12, __, 12, // 12: Query
  13, 13, 13, 13, 13, 13, 13, 13, 13, // 13: Hash // NB does not verify presence of #
  __, __, __, __, __,  8, __, __, __, // 14: RootNoAuth
  11, 15, 15, 15,  7, 10, __, __, 11, // 15: FileSchemeLike
  16, 16, 16, 16, 16, 16, __, __, 16, // 16: OpaquePath
])


// Parser
// ------

function _preprocess (input) {
  // preprocess: remove leading and trailing C0-space
  let anchor = 0, end = input.length
  while (anchor < end && input.charCodeAt(anchor) <= 0x20) anchor++
  while (end > anchor && input.charCodeAt(end-1) <= 0x20) end--
  return input.substring (anchor, end)
    .replace (/[\x09\x0a\x0d]+/g, '')
  // REVIEW see if we can just skip this and remove 
  // HT CR and LF in percent coding normalisation pass
  // (it's fine except for the scheme and port)
}

function parse (input, conf = modes.noscheme) {
  const cctable = conf & o.winSlash ? eqClasses : nonSpecialEqClasses
  return _parse (input, T.Start, cctable, conf)
}

function parsePath (input, conf = modes.noscheme) {
  const cctable = conf & o.winSlash ? pathEqClasses : nonSpecialPathEqClasses
  return _parse (input, T.AfterAuth, cctable, conf)
}

function isDriveString (input) {
  return input.length === 2 &&
    (input[1] === ':' || input[1] === '|') &&
    eqClasses[input.charCodeAt(0)] === 1
}

function isDottedSegment (seg, coded = true) {
  return seg === '.' ? 1 :
    seg === '..' ? 2 :
    coded && seg.length === 3 && low (seg) === '%2e' ? 1 :
    coded && seg.length <= 6
      && (low (seg) === '.%2e'
      || low (seg) === '%2e.'
      || low (seg) === '%2e%2e') ? 2 : 0
}

function _parse (input, _entry = T.Start, cctable = eqClasses, conf = modes.noscheme) {
  input = _preprocess (input) // REVIEW should this be done higher up?
  let entry = _entry, anchor = 0
  let match = T.Fail, end = 0
  const length = input.length

  const url = { }
  outer: while (end < length) {

    // ccstate and ccmatch are maybe too clever;
    // it is a trick, to collect all character classes seen in the token in a single int
    // I plan to use this so that I can err on the use of \ in generic URLs

    let ccstate = 0, ccmatch = 0
    inner: for (let state = entry, pos = anchor = end; state && pos < length;) {
      const c = input[pos++] .charCodeAt (0)
      const cc = c <= 127 ? cctable [c] : cc_other
      ccstate |= 1 << cc
      state = dfa [state * cc_count + cc]
      if (state >= min_accepts) (match = state, end = pos, ccmatch = ccstate)
    }

    switch (match) {
      case T.Scheme:
        url.scheme = input.substring (anchor, end-1)
        conf = modeFor (url);
        [cctable, entry] = conf & o.winSlash
          ? [eqClasses, T.AfterSpecialScheme]
          : [nonSpecialEqClasses, T.AfterScheme]
        continue outer

      case T.OpaquePath:
        // url.opaquePath = input.substring (anchor, end)
        url.file = input.substring (anchor, end) // REVIEW!!
        entry = T.AfterFile
        continue outer;

      case T.Auth: {
        const value = input.substring (anchor+2, end)
        if (conf & o.winDrive && isDriveString (value)) {
          url.host = ''
          url.drive = value
          entry = T.AfterAuth
          continue outer
        }
        else {
          // log ('auth', value, ccInfo(ccmatch))
          assign (url, parseAuth (value))
          entry = T.AfterAuth
          continue outer
        }
      }

      case T.Root:
      case T.RootNoAuth:
        url.root = '/' // input[anchor]
        entry = T.RelativePath
        continue outer

      case T.Dir: {
        const value = input.substring (anchor, end-1)
        // TODO I want to be able to reject non-special, hierarchical URLs that contain \
        // log ('dir', value, ccInfo(ccmatch))
        url.dirs = url.dirs ?? []
        url.dirs.push (value)
        entry = T.RelativePath
        continue outer
      }

      case T.File:
      case T.FileSchemeLike: {
        const value = input.substring (anchor, end)
        if (isDottedSegment (value)) {
          url.dirs = url.dirs ?? []
          url.dirs.push (value)
          entry = T.AfterFile
        }
        else {
          // log ('file', value, ccInfo(ccmatch))
          url.file = value
          entry = T.AfterFile
        }
        continue outer
      }

      case T.Query:
        url.query = input.substring (anchor+1, end)
        entry = T.Hash
        continue outer

      case T.Hash:
        url.hash = input.substring (anchor+1, end)
        break outer
    }
  }
  
  // Drive letter detection
  if (url.drive == null && conf & o.winDrive) {
    const match = _firstNonEmptySegment (url)
    if (match && isDriveString (match.value)) {
      _removePrecedingSegments (url, match)
      url.drive = match.value
      if (match.ord === componentTypes.file)
        delete url.root
      else url.root = '/'
    }
  }

  return url
}


// Authority Parsing
// -----------------

// (c) The credentials sigil is the last "@" - if any.
// If it is present then the authority has a username.

// (w) The password sigil is the first ":" before (c).
// If it is present then the authority has a password.

// (p) The port sigil is the first ":" over-all, or 
// after (c) if (c) is present. If (p) is present then
// the authority has a port.

// The algorithm makes a single pass from left to right over the input
// to find the positions of the sigils. It uses -1 to indicate absence
// for (c) and (w) and it uses input.length to indicate absence of (p).

// NB This does *not* parse the domain. The host property of
// the return value is either an ipv6 address or an opaque host string.

function parseAuth (input) {
  const auth = { }
  const len = input.length
  let c = -1, w = -1, p = len
  let bracks = false

  for (let i=0; i<len; i++) switch (input[i]) {

    case ']':   bracks = false; break
    case '[':   bracks = true;  break
    case '@' : (bracks = false, c = i, p = len); break
    case ':' :
      if (w < 0) w = i
      if (!bracks && p >= c) p = i
  }

  // At this point we have collected the sigil positions
  // and we can break the input string into separate components.

  const str = input.substring.bind (input)

  if (c >= 0) { // has credentials
    if (0 <= w && w < c) { // has password
      auth.user = str (0, w)
      auth.pass = str (w + 1, c)
    }
    else
      auth.user = str (0, c)
  }

  auth.host = parseHost (str (c + 1, p))

  if (p < len) try {
    auth.port = parsePort (str (p + 1))
  }
  catch (e) {
    throw new Error (`Invalid port string in authority //${input}`)
  }

  // Check structural invariants
  const errs = authErrors (auth)
  if (errs) {
    const message = '\n\t- ' + errs.join ('\n\t- ') + '\n'
    throw new Error (`Invalid authority //${input} ${message}`)
  }

  return auth
}


// ### Authority - Structural invariants

function authErrors (auth) {
  const errs = []
  const noHost = auth.host == null || auth.host === ''

  if (noHost && auth.port != null)
    errs.push (`An authority with an empty hostname cannot have a port`)

  if (noHost && (auth.user != null || auth.pass != null))
    errs.push (`An authority with an empty hostname cannot have credentials`)

  if (auth.pass != null && auth.user == null)
    errs.push (`An authority without a username cannot have a password`)

  return errs.length ? errs : null
}



// ### Port

// A port may either be the empty string, 
// or the decimal representation of a number n < 2**16.

function parsePort (input) {
  if (input === '') return input
  if (/^[0-9]+$/.test (input)) {
    const port = +input
    if (input < 2**16) return port
  }
  throw new Error (`Invalid port-string: "${input}"`)
}


// Exports
// -------

export { parse, parsePath, parseAuth, parsePort, isDriveString, isDottedSegment }