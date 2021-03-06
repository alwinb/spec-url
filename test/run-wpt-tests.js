import * as url from '../src/index.js'
const { parseResolve, print } = url
import Tests from './test-runner.js'
import { readFile } from 'fs/promises'
const log = console.log.bind (console)

// Parse-resolve-and-normalise
// ---------------------------

function runTest (test) {
  const resolved = parseResolve (test.input, test.base)
  resolved.href = print (resolved)
  return resolved
}

// Test 
// ----

class WebTests extends Tests {
  compactInput (input) { return 'href:   '+input.href }
  compactOutput (output) { return output.href }
}

const fpath = url.filePath (parseResolve ('run/urltestdata.json', import.meta.url))
const file = await readFile (fpath, { encoding: "utf8" })
const testDataRaw = JSON.parse (file)

const testData = testDataRaw .map (test => {
    if (typeof test !== 'object') return test
    const { input, base, href, failure } = test
    return { input, base, href, failure }
  }
)

const testSet = new WebTests (testData, runTest)
  .filter (input => input && typeof input === 'object')

  .assert ('equal failure', (input, output, error) =>
    !!input.failure === !!error )

  .assert ('equal href', (input, output, error) =>
    input.failure || input.href === output.href )


// Run Tests
// ---------

log ('      Web Platform URL Tests      ')
log ('==================================')
const ok = testSet.run ()
process.exit (ok ? 0 : 1)