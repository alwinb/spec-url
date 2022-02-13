const url = require ('spec-url')
// import * as url from 'spec-url'
const log = console.log.bind (console)

log (url)

log (url.print(url.normalise(url.parseResolve ('foo:/bar/../bee/./', ''))))