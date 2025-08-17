
// URL Parser
// ==========

import { parseAuth } from './authority.js'
import { componentTypes, low, options as o, modes, modeFor, _firstNonEmptySegment, _removePrecedingSegments, } from './model.js'
const { assign } = Object
const log = console.log.bind (console)


// DFA Definition
// --------------

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
   1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  0,  8,  0,  0,  0, 
// '   a   b   c   d   e   f   g   h   i   j   k   l   m   n   o
   0,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1, 
// p   q   r   s   t   u   v   w   x   y   z   {   |   }   ~  DEL
   1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  0,  0,  0,  0, 0 ])

const cc_slash = 5
const cc_other = 0


// ## Transition table / DFA

// Colums corresponds to input character classes
// Rows correspond to input states
// Cells correspond to output state
// States are accepting if they are >= min_accepts

const __ = 0
const min_accepts = 7
const next_entry = 8
const cols = 9


const dfa = new Uint8Array ([
//oth alp +-. dig  :  /   ?   #   nxt,
  __, __, __, __, __, __, __, __, __, // 0: Fail
  12, 16, 12, 12, 12, 15, 13, 14, __, // 1: Start
   8,  8,  8,  8,  8, 15, 13, 14, __, // 2: AfterScheme
  12, 12, 12, 12, 12, 15, 13, 14, __, // 3: AfterSpecialScheme
  12, 12, 12, 12, 12, 10, 13, 14, __, // 4: AfterAuth
  12, 12, 12, 12, 12, 11, 13, 14, __, // 5: RelativePath
  __, __, __, __, __, __, 13, 14, __, // 6: AfterFile
  __, __, __, __, __, __, __, __,  2, // 7: Scheme
   8,  8,  8,  8,  8,  8, __, __,  6, // 8: OpaquePath
   9,  9,  9,  9,  9, __, __, __,  4, // 9: Auth
  __, __, __, __, __, __, __, __,  5, // 10: Root
  __, __, __, __, __, __, __, __,  5, // 11: Dir
  12, 12, 12, 12, 12, 11, __, __,  6, // 12: File
  13, 13, 13, 13, 13, 13, 13, __, 14, // 13: Query
  14, 14, 14, 14, 14, 14, 14, 14, __, // 14: Hash // NB does not verify presence of #
  __, __, __, __, __,  9, __, __,  5, // 15: RootNoAuth
  12, 16, 16, 16,  7, 11, __, __,  6, // 16: FileSchemeLike
])

// ### State and Token IDs

const State = {
  Fail: 0,
  Start: 1,
  AfterScheme: 2,
  AfterSpecialScheme: 3,
  AfterAuth: 4,
  RelativePath: 5,
  AfterFile: 6,
  Scheme: 7,
  OpaquePath: 8,
  Auth: 9,
  Root:10,
  Dir: 11,
  File: 12,
  Query: 13,
  Hash: 14,
  RootNoAuth: 15,
  FileSchemeLike: 16,
}

const stateNames = []
for (const k in State) stateNames[State[k]] = k



// ### Alternative equivalence class tables

// Lookup table for e.g. parsePath where ? and # are 
// not considered to be delimiters:

const pathEqClasses = new Uint8Array(eqClasses)
pathEqClasses['?'.charCodeAt(0)] = cc_other
pathEqClasses['#'.charCodeAt(0)] = cc_other


// Parser
// ------

const T = State
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
  return _parse (input, T.Start, eqClasses, conf)
}

function parsePath (input, conf = modes.noscheme) {
  return _parse (input, T.AfterAuth, pathEqClasses, conf)
}

function readToken (input, anchor, entry, cctable, conf) {
  let match = T.Fail, end = anchor
  const length = input.length
  outer: while (end < length) {
    inner: for (let state = entry, pos = anchor; state && pos < length;) {
      // log ('\t', stateNames[state], input[pos])
      const c = input[pos++] .charCodeAt (0)
      let cc = c <= 127 ? cctable [c] : cc_other
      // Remap `\` to `/` or to cc_other depending on conf
      if (cc === 8) cc = conf & o.winSlash ? cc_slash : cc_other
      state = dfa [state * cols + cc]
      if (state >= min_accepts) (match = state, end = pos)
    }
    // log (stateNames[entry], '\n',
    //   [stateNames[match], input.substring (anchor, end)],
    //   '=>', stateNames[dfa [match * cols + next_entry]])
    // entry = dfa [match * cols + next_entry]
    return [match, anchor, end, dfa [match * cols + next_entry]]
  }
  return [T.Fail,anchor,anchor,T.Fail]
}


function _parse (input, entry = T.Start, cctable = eqClasses, conf = modes.noscheme) {

  const url = { } // parse result in progress
  let ctype = T.Fail
  let anchor = 0, pos = 0 // parser state
  let segments = 0 // for drive letter detection

  // let nonEmptySegments = 0

  input = _preprocess (input) // REVIEW should this be done higher up?


  while ([ctype, anchor, pos, entry] = readToken (input, pos, entry, cctable, conf)) {

    switch (ctype) {

      case T.Scheme:
        url.scheme = input.substring (anchor, pos-1)
        conf = modeFor (url)
        entry = conf & o.winSlash ? T.AfterSpecialScheme : T.AfterScheme
        continue

      case T.OpaquePath:
        // url.opaquePath = input.substring (anchor, pos)
        url.file = input.substring (anchor, pos) // REVIEW!!
        continue

      case T.Auth: {
        const value = input.substring (anchor+2, pos)
        if (conf & o.winDrive && isDriveString (value)) {
          url.host = ''
          url.drive = value
          continue
        }
        else {
          assign (url, parseAuth (value))
          continue
        }
      }

      case T.Root:
      case T.RootNoAuth:
        url.root = '/' // input[anchor]
        continue

      case T.Dir: {
        const value = input.substring (anchor, pos-1)
        if (conf & o.winDrive && url.drive == null &&
          segments === 0 && isDriveString (value)) {
          delete url.root // to keep the js url dict keys ordered 
          delete url.dirs
          url.drive = value
          url.root = '/'
        }
        else {
          segments++
          // nonEmptySegments++
          url.dirs = url.dirs ?? []
          // NB I would like to warn or reject non-special hierarchical with \
          url.dirs.push (value)
        }
        continue
      }

      case T.File:
      case T.FileSchemeLike: {
        const value = input.substring (anchor, pos)
        if (isDottedSegment (value)) {
          url.dirs = url.dirs ?? []
          url.dirs.push (value)
        }
        else if (segments === 0 &&
          conf & o.winDrive && url.drive == null && isDriveString (value)) {
          delete url.root
          url.drive = value
        }
        else {
          segments++
          // nonEmptySegments++
          // NB I would like to warn or reject non-special hierarchical with \
          url.file = value
        }
        continue
      }

      case T.Query:
        url.query = input.substring (anchor+1, pos)
        continue

      case T.Hash:
        url.hash = input.substring (anchor+1, pos)
        case T.Fail:
        return url

    }
  }
  
  return url
}


// Helpers

function isDriveString (input) {
  return input.length === 2 &&
    (input[1] === ':' || input[1] === '|') &&
    eqClasses[input.charCodeAt(0)] === 1
}

function isDottedSegment (s) {
  return s.length < 7 ? (dots [s.toLowerCase ()] ?? 0) : 0
}

const dots = {
  '.': 1, '..': 2,
  '%2e': 1, '.%2e': 2,
  '%2e.': 2, '%2e%2e': 2
}


// Exports
// -------

export { parse, parsePath, isDriveString, isDottedSegment }