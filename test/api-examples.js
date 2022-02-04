import URLReference from '../src/api-a.js'
const log = console.log.bind (console)

// Try
// ===

var url

// Constructor 

// Drive letter
url = new URLReference ('c|/foo', 'file:')
log (url)

// No drive letter
url = new URLReference ('c|/foo', 'x:/') // REVIEW should 'x:' as a base be tolerated?
log (url)

// Construct from object
url = new URLReference (url, 'foo/bar')
url = new URLReference (url, 'http:')
log (url)


// Rebase, Resolve

url = new URLReference ('/foo/bar') .rebase ('//host?q')
log (url)

url = new URLReference ('http:/foo/bar') .resolve ('http://host?q')
log (url)

url = new URLReference ('http:/foo/bar') .resolve ()
log (url)

// IPv4

url = new URLReference ('http://0.0.1')
log (url)

url = new URLReference ('x://0.0.1')
log (url)

url = new URLReference ('//0.0.1')
log (url)

// IPv6
url = new URLReference ('http://[0::1]')
log (url)

url = new URLReference ('x://[0::1]')
log (url)

url = new URLReference ('//[0::1]')
log (url)

// Domains
url = new URLReference ('//abc%44ef', 'file:')
log (url)

url = new URLReference ('//abc%44ef', 'http:')
log (url)

// url = new URLReference ('http://%20') // should fail // REVIEW
// log (url)

// Opaque hosts

url = new URLReference ('//foo')
log (url)

url = new URLReference ('x://%20') // Should not fail
log (url)

url = new URLReference ('//%20') // Should not fail
log (url)

url = new URLReference ('//abc%44ef', 'x:/')
log (url)

url = new URLReference ('//abc%44ef')
log (url)


// toString
url = new URLReference ('//γαμμα/bar')
log (url.toString (), JSON.stringify (url))