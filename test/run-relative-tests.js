import * as url from '../src/index.js'
import testData from './testdata.js'
import Tests from './test-runner.js'
const log = console.log.bind (console)


// Parse-rebase-and-normalise
// ---------------------------

function runTest (test) {
  let rebased = url.parseRebase (test.input, test.base)
  rebased = url.percentEncode (url.normalise (rebased))
  rebased.href = url.print (rebased)
  return rebased
}


// Test 
// ----

class SpecURLTests extends Tests {
  compactInput (test) { return 'input:    '+test.input + '\nexpected: '+test.href }
  compactOutput (output) { return '  '+output.href }
}

const testSet = new SpecURLTests (testData, runTest)
  .filter (input => input && typeof input === 'object')

  .assert ('equal failure', (input, output, error) => {
    // log ('equal failure?', input, output, error)
    return !!input.failure === !!error 
  })

  .assert ('equal href', (input, output, error) =>
    input.failure || input.href === output.href )


// Run Tests
// ---------

log ('          Spec-URL Tests          ')
log ('==================================')
const ok = testSet.run ()
process.exit (ok ? 0 : 1)

