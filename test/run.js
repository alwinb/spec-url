const { modeFor, parse, print, percentEncode, normalise, force, resolve } = require ('../src')
const Tests = require ('./test-runner')
const log = console.log.bind (console)

// Parse-resolve-and-normalise
// ---------------------------

const parseResolveAndNormalise = (input, baseUrl = { }) => {
  const url = parse (input, modeFor (baseUrl))
  return percentEncode (normalise (force (resolve (url, baseUrl))))
}

function runTest (test) {
  const baseUrl = parseResolveAndNormalise (test.base)
  let resolved = parseResolveAndNormalise (test.input, baseUrl)
  resolved.href = print (resolved)
  resolved._base = baseUrl
  return resolved
}

// Test 
// ----

class WebTests extends Tests {
  compactInput (input) { return 'href:   '+input.href }
  compactOutput (output) { return output.href }
}

const testData = require ('./run/urltestdata.json') .map (test => {
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

// TODO validate 'dirs' to be iterable
// And.. also make a defensive copy?
// var r = new Url ('file:///foo').set ({ dirs:1 })
// log (r)

// Run Tests
// ---------

log ('      Web Platform URL Tests      ')
log ('==================================')
const ok = testSet.run ()
process.exit (ok ? 0 : 1)