import { URLReference } from '../src/api.js'
import { readFile } from 'fs/promises'
import Tests from './test-runner.js'
const log = console.log.bind (console)

// Parse-resolve-and-normalise
// ---------------------------

const encodeSettings =
  { fixup:false, strict:false, incremental:true, unicode:false }

function runTest (test) {
  const ref = new URLReference (test.input, test.base)
  return ref.resolve (null, { unicode:false })
  // let resolved = parseResolve (test.input, test.base)
  // resolved = url.unstable.percentEncodeMut (resolved, encodeSettings)
  // resolved.href = print (resolved, { unicode:false })
  // return resolved
}

// Test 
// ----

class WebTests extends Tests {
  compactInput (input) { return 'href:   '+input.href }
  compactOutput (output) { return output.href }
}

const fpath = decodeURIComponent (new URLReference ('run/urltestdata.json', import.meta.url) .pathname)
const file = await readFile (fpath, { encoding: "utf8" })
const testData = JSON.parse (file)

const testSet = new WebTests (testData, runTest)
  .filter (test => test && typeof test === 'object')

  .assert ('equal failure', (test, output, error) =>
    !!test.failure === !!error )

  .assert ('equal scheme', (test, output, error) =>
    !('protocol' in test) || test.protocol === output.scheme + ':')

  .assert ('equal username', (test, output, error) =>
    !('username' in test) || test.username === output.username || test.username === '' && output.user == null)

  .assert ('equal password', (test, output, error) =>
    !('password' in test) || test.password === output.password || test.password === '' && output.pass == null)

  // Can add the others; It's fine
  // pathname, hostname

  .assert ('equal query', (test, output, error) =>
    !('search' in test)
    || test.search === '' && (output.query === '' || output.query == null)
    || test.search === ('?' + output.query)
  )

  .assert ('equal fragment', (test, output, error) =>
    !('hash' in test)
    || (test.hash === '' && output.fragment == null)
    || (test.hash === '' && output.fragment == '')
    || (test.hash === '#' + output.fragment)
  )

  .assert ('equal href', (test, output, error) =>
    test.failure || test.href === output.href )


// Run Tests
// ---------

log ('      Web Platform URL Tests      ')
log ('==================================')
const ok = testSet.run ()
process.exit (ok ? 0 : 1)