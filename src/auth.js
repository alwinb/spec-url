import { ipv6 } from './host.js'
const log = console.log.bind (console)

// ### Authority Parsing

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
// the return value is either an ipv6 address or an opaque host.

function parseAuth (input) {
  // log ('parseAuth', input)
  const auth = { }
  const len = input.length
  const str = input.substring.bind (input)
  let bracks = false
  let c = -1, w = -1, p = len

  for (let i=0; i<len; i++) {
    const ch = input [i]
    // log (ch, { w, c, p, bracks })

    if (ch === '[')
      bracks = true

    else if (ch === ']')
      bracks = false

    else if (ch === '@') {
      c = i
      p = len
      bracks = false
    }
    else if (ch === ':') {
      if (w < 0) w = i
      if (!bracks && p >= c) p = i
    }
  }

  if (c >= 0) { // has credentials
    if (0 <= w && w < c) { // has password
      auth.user = str (0, w)
      auth.pass = str (w + 1, c)
    }
    else
      auth.user = str (0, c)
  }

  auth.host = input[c + 1] === '['
    ? ipv6.parse (str (c + 2, p - 1)) // ipv6 address
    : str (c + 1, p) // opaque host

  if (p < len) { // has port
    try {
      auth.port = parsePort (str (p + 1))
    }
    catch (e) {
      throw new Error (`Invalid port string in authority //${input}`)
    }
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

const authErrors = (auth) => {
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

// A port may either be the empty string, or the decimal representation
// of a number n < 2**16.

const parsePort = input => {
  if (input === '') return input
  if (/^[0-9]+$/.test (input)) {
    const port = +input
    if (input < 2**16) return port
  }
  throw new Error (`Invalid port-string: "${input}"`)
}


// Exports

export { parseAuth, parsePort }