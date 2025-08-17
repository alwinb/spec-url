import { URLReference } from '../src/api.js'
const log = console.log.bind (console)

// README

new URLReference ('filename.txt#top', '//host') .href
// => '//host/filename.txt#top'

new URLReference ('?do=something', './path/to/resource') .href
// => './path/to/resource?do=something'

new URLReference ('take/action.html') .resolve ('http://🌲') .href
// => 'http://xn--vh8h/take/action.html'

// Terminology - rebase

new URLReference (`foo/bar#bee`) .rebase (`//host/index.html`) .href
// => `//host/foo/bar#bee

new URLReference (`foo/bar`) .rebase (`bee/buzz?search`) .href
// => `bee/foo/bar`.

// API - Introduction

const r1 = new URLReference ();
// r.href == '' // The 'empty relative URL'

const r2 = new URLReference ('/big/trees/');
// r.href == "/big/trees/"

const r3 = new URLReference ('index.html', '/big/trees/');
// r.href == "/big/trees/index.html"

const r4 = new URLReference ('README.md', r3);
// r.href == "/big/trees/README.md"

// API - Constructor

new URLReference ('\\foo\\bar', 'http:/') .href
// 'http:/foo/bar'

new URLReference ('\\foo\\bar', 'ofp:/') .href
// 'ofp:/\\foo\\bar'

new URLReference ('/c:/path/to/file') .driveletter
// 'c:'

new URLReference ('/c:/path/to/file', 'http:') .driveletter
// null

