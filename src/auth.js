import { parseHost } from './host.js'
const log = console.log.bind (console)

// ### Authority Parsing

// (c) The credentials sigil is the last "@" - if any.
// (w) The password sigil is the first ":" before (c).
// (p) The port sigil is the first ":" after (c).

function parseAuth (input, mode) {
  const auth = { }
  const len = input.length
  const str = input.substring.bind (input)
  let bracks = false
  let c = -1, w = -1, p = len + 1

  for (let i=0; i<len; i++) {
    const ch = input [i]
    // log (ch, { w, c, p, bracks })

    if (ch === '[')
      bracks = true

    else if (ch === ']')
      bracks = false

    else if (ch === '@') {
      c = i
      p = len + 1
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

  auth.host = str (c + 1, p) //parseHost (str (c + 1, p), mode)
  if (p < len) // has port
    auth.port = parsePort (str (p + 1))

  return auth
}

const parsePort = input => {
  if (input === '') return input
  if (/^[0-9]+$/.test (input)) {
    const port = +input
    if (input < 2**16) return port
  }
  throw new Error (`Invalid port-string: "${input}"`)
}

export { parseAuth }
