import { URLReference } from '../src/api.js'
import * as assert from 'assert/strict'
const log = console.log.bind (console)


// Assertion tests
// ===============

// This is is just a file with a list of assertions,
// to be run as a script; no test-runner.


// Constructor, Parsing
// --------------------

// Just try parsing

var r = new URLReference ('//foo')
assert.equal (r.hostname, 'foo')

// Try parse-and-rebase

var r = new URLReference ('//foo', 'http:')
assert.equal (r.scheme, 'http')
assert.equal (r.hostname, 'foo')

// Parsing uses the base to determine how backslashes are handled.
// The input here is parsed as '//foo' because 'http' is 'special'.

var r = new URLReference ('\\\\foo', 'http:')
assert.equal (r.scheme, 'http')
assert.equal (r.hostname, 'foo')

var r = new URLReference ('http:\\\\foo')
assert.equal (r.scheme, 'http')
assert.equal (r.href, 'http://foo')

// This is also the case if no scheme is present;
// scheme-less URLReferences are parsed as 'special'.

var r = new URLReference ('\\\\foo\\bar\\bee')
assert.equal (r.scheme, null)
assert.equal (r.hostname, 'foo')
assert.equal (r.pathname, '/bar/bee')


// With a non-special URL as a base, '\' is not treadted as a separator.
// REVIEW It would be nice to allow parsing against 'otp:', right?
// REVIEW It might b better to throw on `\` in non-special URLs.

var r = new URLReference ('\\\\foo', 'otp:/')
assert.equal (r.scheme, 'otp')
assert.equal (r.hostname, null)
assert.equal (r.filename, '\\\\foo')

// Drive letters in scheme-less input are detected. 
// If found, an explicit file scheme is added (!)

var r = new URLReference ('/c:/foo/bar')
assert.equal (r.href, 'file:/c:/foo/bar')
assert.equal (r.driveletter, 'c:')

var r = new URLReference ('c|/foo/bar')
assert.equal (r.href, 'file:/c|/foo/bar')
assert.equal (r.driveletter, 'c|')

// This bahviour is suppressed when given a non-file base:

var r = new URLReference ('/c:/foo/bar', 'http:')
assert.equal (r.href, 'http:/c:/foo/bar')
assert.equal (r.driveletter, null)

// Href returns ASCII-strings
// toString preserves Unicode (!)

var r = new URLReference ('🌲')
assert.equal (r.href, '%F0%9F%8C%B2')
assert.equal (String (r), '🌲')

var r = new URLReference ('αβγ')
assert.equal (r.href, '%CE%B1%CE%B2%CE%B3')
assert.equal (String (r), 'αβγ')

// This is also true for hostnames.
// Note that a new URLReference hostname is always an opaque-host-string,
// even if it has a web-scheme. (Parsing and verifying the opaque host
// as a domain is done by the resolve method, not by the constructor).
// Href uses percent-coding to convert the opaque-hostname to ASCII.

var r = new URLReference ('http://🌲')
assert.equal (r.href, 'http://%F0%9F%8C%B2')
assert.equal (String (r), 'http://🌲')
assert.equal (r.hostname, '🌲')

// Resolve converts the hostname of special URLs to a domain.
// Href uses punycode to convert the domain to ASCII.
// toString preserves Unicode in domains.

var r = new URLReference ('http://🌲') .resolve ()
assert.equal (r.href, 'http://xn--vh8h/')
assert.equal (String (r) , 'http://🌲/')
assert.equal (r.hostname, '🌲')

// Resolve maintains opaque-host-strings in non-special URLs.
// Href uses percent-coding to convert the opaque-hostname to ASCII.
// toString preserves Unicode in opaque-hostnames.

var r = new URLReference ('otp://🌲') .resolve ()
assert.equal (r.href, 'otp://%F0%9F%8C%B2')
assert.equal (String (r) , 'otp://🌲')
assert.equal (r.hostname, '🌲')


// Rebase and Resolve Methods
// --------------------------

// ### Rebase

var r = new URLReference ('foo') .rebase ('//host')
assert.equal (r.href, '//host/foo')

var r = new URLReference ('foo') .rebase ('//host')
assert.equal (r.href, '//host/foo')

var r = new URLReference ('#bar') .rebase ('foo')
assert.equal (r.href, 'foo#bar')

var r = new URLReference ('bar') .rebase ('foo')
assert.equal (r.href, 'bar')

var r = new URLReference ('bar') .rebase ('foo/')
assert.equal (r.href, 'foo/bar')

// Absent and null arguments are interpreted as the
// empty URLReference.

var r = new URLReference (null)
assert.equal (r.href, '')

var r = new URLReference (null, null)
assert.equal (r.href, '')

var r = new URLReference ('#foo') .rebase (null)
assert.equal (r.href, '#foo')

var r = new URLReference ('#foo') .rebase ()
assert.equal (r.href, '#foo')

// Empty URL input removes hash from base

var r = new URLReference ('') .rebase ('foo#bar')
assert.equal (r.href, 'foo')

var r = new URLReference () .rebase ('#bar')
assert.equal (r.href, '')

var r = new URLReference (null) .rebase ('#bar')
assert.equal (r.href, '')


// ### Resolve

// Resolve can be used without argument to coerce an URL
// to an absolute URL and applies normalisation.

// It uses forced non-stict resolution for special URLs. 
// This is the same resolution behaviour that the WHATWG uses.

var r = new URLReference ('http:foo') .resolve ()
assert.equal (r.hostname, 'foo')

// And it uses strict resolution for other URLs.
var r = new URLReference ('otp:foo') .resolve ()
assert.equal (r.pathname, 'foo')
assert.equal (r.filename, 'foo') // REVIEW should this be exposed as filename, given it is an opaquePath?


// Scheme and protocol
// -------------------

var r = new URLReference ('xf://foo')
assert.equal (r.scheme, 'xf')
// (I've disabled the protocol getter)
// assert.equal (r.protocol, 'xf:')

// You cannot unset the file scheme of an URL with a drive letter
var r = new URLReference ('file:/c:/foo')
assert.throws (
  _ => r.scheme = null,
  /cannot change the scheme .* has a drive-letter/)

// But you can otherwise
var r = new URLReference ('file:/foo')
r.scheme = null
assert.equal (r.href, '/foo')

// And reparse bugs are prevented for scheme-like filenames
var r = new URLReference ('file:foo:bar')
r.scheme = null
assert.equal (r.href, 'foo%3Abar')

// The same is true for scheme-like dirs
var r = new URLReference ('file:foo:bar/')
r.scheme = null
assert.equal (r.href, 'foo%3Abar/')

// TODO currently I am not yet preventing all reparse bugs with drive-letter like strings;
// The WHATWG standard has some issues that block me from doing so without failing some tests.
// They don't have a drive-letter property so for them these are not reparse bugs.

// Preventing drive letter ambiguities

var r = new URLReference ('http:c:')
r.scheme = null
assert.equal (r.href, 'c%3A')

// var r = new URLReference ('http:c|/')
// r.scheme = null
// assert.equal (r.href, 'c%7C/') // FIXME

// But this is ok
var r = new URLReference ('http:c|a-b')
r.scheme = null
assert.equal (r.pathname, 'c|a-b')



// Authority
// ---------

// ### Username 

// Setter resets password

var r = new URLReference ('otp://joe:secret@host:22')
r.username = 'jane'
assert.equal (r.href, 'otp://jane@host:22')

var r = new URLReference ('otp://joe:secret@host:22')
r.username = null
assert.equal (r.href, 'otp://host:22')


// ### Password

// You cannot set a password on an URL without host

var r = new URLReference ('sch:/foo/bar')
assert.throws(
  _ => r.password = '',
  /cannot set a password .*does not have a hostname/)

var r = new URLReference ('sch:///bar')
assert.throws(
  _ => r.password = '',
  /cannot set a password .*does not have a hostname/)

// You cannot set a password on an URL without a username

var r = new URLReference ('sch://host/bar')
assert.throws(
  _ => r.password = '',
  /cannot set a password .*does not have a username/)


// ### Hostname

// Hostname setter resets credentials and port

var r = new URLReference ('otp://joe:secret@host:22')
r.hostname = 'other'
assert.equal (r.href, 'otp://other')

// Hostnames are IPv6 or opaque hosts by default

var r = new URLReference ('sc://')
r.hostname = '[1:0:0:0::1]'
assert.equal (r.hostname, '[1::1]')

assert.throws (
  _ => r.hostname = '[1:0:0:0::11', 
  /Invalid .*IPv6/)


/*
// I am allowing invalid opaque-host codepoints in the setter

// REVIEW -- I have disabled this for now
// I may allow this again in a later stage

var r = new URLReference ('otp://foo')
r.hostname = 'foo{}[]'
assert.equal (r.href, 'otp://foo{}%5B%5D')

// REVIEW: should the setter apply percent coding? WHATWG does;
// I like the idea fully decoded components, but then again URL also has reserved characters.

// assert.equal (r.hostname, 'foo{}%5B%5D')
assert.equal (r.hostname, 'foo{}[]')

r.hostname = null 
assert.equal (r.hostname, null)
assert.equal (r.href, 'otp:')

//*/



  
// ### Port

var r = new URLReference ('//host')

// REVIEW / It may be wise to remove empty ports,
// so as to avoid possible confusion with drive letters.

r.port = ''
assert.equal (r.port, '')
assert.equal (r.href, '//host:')

r.port = null
assert.equal (r.href, '//host')

r.port = 0xA
assert.equal (r.href, '//host:10')

// NB Floats are truncated
r.port = 1.98
assert.equal (r.href, '//host:1')

r.port = '10'
assert.equal (r.href, '//host:10')

r.port = '009'
assert.equal (r.href, '//host:9')

assert.throws (
  _=> r.port = '0xa',
  /cannot set (a |the )?port/)

assert.throws (
  _=> r.port = 2**17,
  /cannot set (a |the )?port/)



// Drive letters
// -------------

var r = new URLReference ()

// Setting a drive-letter will also set the scheme to file

r.driveletter = 'C|'
assert.equal (r.href, 'file:/C|')
assert.equal (r.driveletter, 'C|')
assert.equal (r.hostname, null)

// You cannot set the a drive letter on an URL with a scheme
// other than file

var r = new URLReference ('scheme://host/path')
assert.throws (
  _ => r.driveletter = 'c',
  /cannot set a drive-letter .* does not have a file-scheme/)

// You can set the driveletter using a single char

var r = new URLReference ('file:')
r.driveletter = 'c'
assert.equal (r.href, 'file:/c:')

// Or properly

var r = new URLReference ('file:')
r.driveletter = 'c:'
assert.equal (r.href, 'file:/c:')

var r = new URLReference ('file:')
r.driveletter = 'c|'
assert.equal (r.href, 'file:/c|') // REVIEW should we normalise to c: ?

// But not something else

assert.throws (
  _ => r.driveletter = 'cd',
  /cannot set (a|the) drive-letter/)

assert.throws (
  _ => r.driveletter = 'c/',
  /cannot set (a|the) drive-letter/)

assert.throws (
  _ => r.driveletter = 'c#',
  /cannot set (a|the) drive-letter/)



// Pathroot
// --------

// If an URLReference has an authority or a drive, and it has dir or file components,
// then it must also have has a pathroot. 
// This affects hostname, driveletter, pathname, filename and pathroot setters.

var r = new URLReference ('foo/bar')
r.hostname = 'Bee'
assert.equal (r.href, '//Bee/foo/bar')

var r = new URLReference ('foo.txt')
r.hostname = 'Bee'
assert.equal (r.href, '//Bee/foo.txt')


var r = new URLReference ('foo/bar')
r.hostname = ''
assert.equal (r.href, '///foo/bar')

var r = new URLReference ('foo.txt')
r.hostname = ''
assert.equal (r.href, '///foo.txt')


var r = new URLReference ('foo/bar')
r.driveletter = 'C'
assert.equal (r.href, 'file:/C:/foo/bar')

var r = new URLReference ('index.html')
r.driveletter = 'D|'
assert.equal (r.href, 'file:/D|/index.html')


// Setting a filename, or a relative pathname on an URLReference
// that has an authority, also sets the path-root

var r = new URLReference ('//auth')
r.filename = 'foo'
assert.equal (r.href, '//auth/foo')

var r = new URLReference ('//auth')
r.pathname = 'relative/path?'
assert.equal (r.href, '//auth/relative/path%3F')

// This is also the case if the authority is empty

var r = new URLReference ('sc://')
r.filename = 'foo'
assert.equal (r.href, 'sc:///foo')

var r = new URLReference ('sc://')
r.pathname = 'relative/path'
assert.equal (r.href, 'sc:///relative/path')

// Setting a relative pathname on an URLReference that has a
// drive-letter also sets the path-root

var r = new URLReference ('file:///c:')
r.filename = 'foo'
assert.equal (r.href, 'file:///c:/foo')

// One cannot remove the path-root from an URLReference that 
// that has both an authority and dir or file components

var r = new URLReference ('//auth/dir/')
assert.throws (
  _ => r.pathroot = null,
  /cannot remove (the )?path-root/)

// This is also the case if the authority is empty

var r = new URLReference ('///dir/')
assert.throws (
  _ => r.pathroot = null,
  /cannot remove (the )?path-root/)

// One cannot remove the path-root from an URLReference that 
// that has a drive-letter and dir or file components

var r = new URLReference ('/c:/dir/')
assert.throws (
  _ => r.pathroot = null,
  /cannot remove (the )?path-root/)

var r = new URLReference ('C|/file')
assert.throws (
  _ => r.pathroot = null,
  /cannot remove (the )?path-root/)


// Pathname
// --------

// pathname is pretty much a legacy setter and it
// affects all drive / root / dir and file components at once

// Setting a relative path on an URL with a drive
// will remove the drive.

var r = new URLReference ('file:/c:')
r.pathname = 'path/to/file'
assert.equal (r.href, 'file:path/to/file')

// REVIEW Setting a relative path will remove all 
// drive / root / dir / file components. However if the URL
// has an authority then it will set the path-root.

var r = new URLReference ('file:///c:')
r.pathname = 'path/to/file'
assert.equal (r.href, 'file:///path/to/file')


// assert.equal (r.href, 'file:///c:/relative/path')

var r = new URLReference ('foo/bar')
r.hostname = 'Bee' // adds the root too
assert.equal (r.href, '//Bee/foo/bar')

// Setting a pathname with a drive-letter in it,
// in an URL that does not have a scheme,
// will implicitly add the file: scheme (!)

var r = new URLReference ('index.html?que=hi!')
r.pathname = 'c:'
assert.equal (r.href, 'file:/c:?que=hi!')

var r = new URLReference ('/c:/')
r.pathname = 'relative'
assert.equal (r.href, 'file:relative')


// Filename
// --------

var r = new URLReference ('http://host/')
r.filename = 'hello'
assert.equal (r.href, 'http://host/hello')
r.filename = null
assert.equal (r.href, 'http://host/')


// That's all folks!

log ('All test passed')