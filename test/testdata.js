export default [

  // Scheme-less URLs use `\` as path separators:
  {
    input: '/bar\\bee',
    href: '/bar/bee'
  },
  {
    input: '/foo/bar\\bee/..',
    href: '/foo/bar/'
  },

  // Scheme-less URLs encode `'` in the query:
  {
    input: '?q=with-\'-sign',
    href: '?q=with-%27-sign'
  },

  // Scheme-less URLs are parsed with an opaque host,
  // thus, the following does not throw an error:
  {
    input: '//this-%00-cannot-be-a-domain/',
    href: '//this-%00-cannot-be-a-domain/'
  },

  // The authority of scheme-less URLs may have credentials:
  {
    input: '//joe:secret@host/',
    href: '//joe:secret@host/'
  },

  // But not with a file: base
  // REVIEW I may want to allow that though
  {
    input: '//joe:secret@host/',
    base: 'file:',
    failure: true,
  },
  
  
  // Other parsing behaviour can be selected by
  // supplying a base-URL to the constructor.
  {
    input: '/foo/bar\\bee/',
    base: 'sch:/',
    href: 'sch:/foo/bar\\bee/'
  },
  {
    input: '/foo/bar\\bee/..',
    base: 'sch:/',
    href: 'sch:/foo/'
  },
  {
    input: '?q=with-\'-sign',
    base: 'sch:/', 
    href: 'sch:/?q=with-\'-sign'
  },
  {
    input: '//this-%00-cannot-be-a-domain/',
    base: 'file:',
    failure: true,
  },
  {
    input: '//joe:secret@host/',
    base: 'file:',
    failure: true,
  },
  

  // The base URL need not be an absolute URL. 
  {
    input: '//input-auth',
    base: '/base/path/file',
    href: '//input-auth',
  },
  {
    input: './',
    base: '/path/dir/file',
    href: '/path/dir/',
  },
  {
    input: '',
    base: '/path/dir/file',
    href: '/path/dir/file',
  },
  {
    input: 'input-file',
    base: '/path/dir/base-file',
    href: '/path/dir/input-file',
  },

  // The base URL however must not have an opaque path:
  {
    input: '/foo/bar',
    base: 'sch:opaque',
    failure: true,
  },
  {
    input: 'foo/bar',
    base: 'sch:opaque',
    failure: true,
  },
  {
    input: 'foo',
    base: 'sch:opaque',
    failure: true,
  },
  {
    input: '?query',
    base: 'sch:opaque',
    failure: true,
  },
  {
    input: '',
    base: 'sch:opaque',
    failure: true,
  },

  // Unless the input consists of a fragment only!
  {
    input: '?query',
    base: 'sch:opaque',
    failure: true,
  },

  // Non-special URLs that do not have path components
  // behave likewise. They can be thought of as having
  // an empty opaque path.
  {
    input: '/foo/bar',
    base: 'sch:',
    failure: true,
  },
  {
    input: '/foo/bar',
    base: 'sch:?base-query',
    failure: true,
  },
  {
    input: '/foo/bar',
    base: 'sch:#base-fragment',
    failure: true,
  },

  // Special URLs do not have opaque paths
  // and therefore the following *does* work:
  {
    input: '//host/foo/bar',
    base: 'http:',
    href: 'http://host/foo/bar',
  },


  // The input is not *resolved* against the base, instead it
  // is _rebased_ on the base. The difference is that _resolve_
  // always produces an absolute URL, and _rebase_ may not.
  // Specifically, the folowing URLs are valid relative URLs:
  {
    input: 'http:foo',
    href: 'http:foo',
  },
  {
    input: 'http:/bar',
    href: 'http:/bar',
  },

  // The rebase operation can be used to build such URLs as well:
  {
    input: 'foo',
    base: 'http:',
    href: 'http:foo',
  },
  {
    input: 'foo/bar',
    base: 'http:',
    href: 'http:foo/bar',
  },
  {
    input: '/foo/bar',
    base: 'http:',
    href: 'http:/foo/bar',
  },
  {
    input: '?query',
    base: 'http:',
    href: 'http:?query',
  },
  {
    input: '#fragment',
    base: 'http:',
    href: 'http:#fragment',
  },
  {
    input: '',
    base: 'http:',
    href: 'http:',
  },

  // This is neccesary because the WHATWG URL constructor, *does accept*
  // such URLs as their first argument. They are host-relative URLs. 
  // If they are resolved (or rebased) onto a special URL with a matching
  // scheme, then the host is taken from the base URL. This is called
  // non-strict resolution in RFC 3986 and the WHATWG only uses this
  // behaviour with special URLs.
  {
    input: 'http:foo',
    base: 'http://host',
    href: 'http://host/foo',
  },
  {
    input: 'http:foo/bar',
    base: 'http://host',
    href: 'http://host/foo/bar',
  },
  {
    input: 'http:/foo/bar',
    base: 'http://host',
    href: 'http://host/foo/bar',
  },
  {
    input: 'http:?query',
    base: 'http://host',
    href: 'http://host?query',
  },
  {
    input: 'http:#fragment',
    base: 'http://host',
    href: 'http://host#fragment',
  },
  {
    input: '',
    base: 'http://host',
    href: 'http://host',
  },

  // Something similar is true for non-file special URLs that have
  // an empty host. Such URLs are not absolute URLs, but they are
  // accepted as valid relative URLs.
  {
    input: 'http:///foo',
    href: 'http:///foo'
  },

  // However, such URLs do not take the host from the base,
  // because they have an empty host already.
  {
    input: 'http:///foo',
    base: 'http://bar',
    href: 'http:///foo'
  },

  // TODO Add tests for forcing and resolution
  // (and setters)

  // Scheme-less URLs do not consider drive letters (!)
  {
    input: '/c|/..',
    href: '/'
  },

  // You can opt-in to parsing drive letters by using 'file:' as 
  // a base.
  {
    input: '/c:/..',
    base: 'file:',
    href: 'file:/c:/'
  },
  {
    input: 'c|/..',
    base: 'file:',
    href: 'file:/c:/'
  },


  // Path normalisation
  // ------------------

  {
    input: '//host/foo/..',
    href: '//host/'
  },

  // ### Dotted file segements
  {
    input: 'bar',
    base: '/foo/.',
    href: '/foo/bar'
  },
  {
    input: 'bar',
    base: '/foo/..',
    href: '/bar'
  },

  {
    // REVIEW does this agree with resolution?
    // => No. It forces the URL *before* normalisation (!!)
    input: 'http:foo/..',
    href: 'http:'
  },

  // Path normalisation should not result in an empty URL.
  {
    input: 'foo/..',
    href: './'
  },
  {
    input: 'foo/../',
    href: './'
  },
  {
    input: '.',
    href: './'
  },

  // Relative paths can have leading .. segments
  {
    input: '..',
    href: '../'
  },
  {
    input: '../a/./b',
    href: '../a/b'
  },
  {
    input: '../a/../../b',
    href: '../../b'
  },

  // Relative paths cannot have .. segments otherwise
  {
    input: 'a/./b/../c',
    href: 'a/c'
  },

  // Absolute paths cannot have leading .. segments
  {
    input: '/../a/./b',
    href: '/a/b'
  },
  {
    input: '/../a/../../b',
    href: '/b'
  },


  // Rebase - Precedence Tests
  // -------------------------

  // ord (base) === fragment
  {
    input: '#hash1',
    base: '#hash2',
    href: '#hash1',
  },
  {
    input: '?query1',
    base: '#hash2',
    href: '?query1',
  },
  {
    input: 'file1',
    base: '#hash2',
    href: 'file1',
  },
  {
    input: 'dir1/',
    base: '#hash2',
    href: 'dir1/',
  },
  {
    input: '/dir1/',
    base: '#hash2',
    href: '/dir1/',
  },
  {
    input: '//auth1',
    base: '#hash2',
    href: '//auth1',
  },
  {
    input: 'sc1:',
    base: '#hash2',
    href: 'sc1:',
  },

  // ord (base) === query
  {
    input: '#hash1',
    base: '?query2#hash2',
    href: '?query2#hash1',
  },
  {
    input: '?query1',
    base: '?query2#hash2',
    href: '?query1',
  },
  {
    input: 'file1',
    base: '?query2#hash2',
    href: 'file1',
  },
  {
    input: 'dir1/',
    base: '?query2#hash2',
    href: 'dir1/',
  },
  {
    input: '/dir1/',
    base: '?query2#hash2',
    href: '/dir1/',
  },
  {
    input: '//auth1',
    base: '?query2#hash2',
    href: '//auth1',
  },
  {
    input: 'sc1:',
    base: '?query2#hash2',
    href: 'sc1:',
  },

  // ord (base) === file
  {
    input: '#hash1',
    base: '__file2_?query2#hash2',
    href: '__file2_?query2#hash1',
  },
  {
    input: '?query1',
    base: '__file2_?query2#hash2',
    href: '__file2_?query1',
  },
  {
    input: 'file1',
    base: '__file2_?query2#hash2',
    href: 'file1',
  },
  {
    input: 'dir1/',
    base: '__file2_?query2#hash2',
    href: 'dir1/',
  },
  {
    input: '/dir1/',
    base: '__file2_?query2#hash2',
    href: '/dir1/',
  },
  {
    input: '//auth1',
    base: '__file2_?query2#hash2',
    href: '//auth1',
  },
  {
    input: 'sc1:',
    base: '__file2_?query2#hash2',
    href: 'sc1:',
  },

  // ord (base) === dir
  {
    input: '#hash1',
    base: '__dir2/__file2_?query2#hash2',
    href: '__dir2/__file2_?query2#hash1',
  },
  {
    input: '?query1',
    base: '__dir2/__file2_?query2#hash2',
    href: '__dir2/__file2_?query1',
  },
  {
    input: 'file1',
    base: '__dir2/__file2_?query2#hash2',
    href: '__dir2/file1',
  },
  {
    input: 'dir1/',
    base: '__dir2/__file2_?query2#hash2',
    href: '__dir2/dir1/',
  },
  {
    input: '/dir1/',
    base: '__dir2/__file2_?query2#hash2',
    href: '/dir1/',
  },
  {
    input: '//auth1',
    base: '__dir2/__file2_?query2#hash2',
    href: '//auth1',
  },
  {
    input: 'sc1:',
    base: '__dir2/__file2_?query2#hash2',
    href: 'sc1:',
  },

  // ord (base) === path-root
  {
    input: '#hash1',
    base: '/dir2/file2?query2#hash2',
    href: '/dir2/file2?query2#hash1',
  },
  {
    input: '?query1',
    base: '/dir2/file2?query2#hash2',
    href: '/dir2/file2?query1',
  },
  {
    input: 'file1',
    base: '/dir2/file2?query2#hash2',
    href: '/dir2/file1',
  },
  {
    input: 'dir1/',
    base: '/dir2/file2?query2#hash2',
    href: '/dir2/dir1/',
  },
  {
    input: '/dir1/',
    base: '/dir2/file2?query2#hash2',
    href: '/dir1/',
  },
  {
    input: '//auth1',
    base: '/dir2/file2?query2#hash2',
    href: '//auth1',
  },
  {
    input: 'sc1:',
    base: '/dir2/file2?query2#hash2',
    href: 'sc1:',
  },

  // ord (base) === auth
  {
    input: '#hash1',
    base: '//auth2/dir2/file2?query2#hash2',
    href: '//auth2/dir2/file2?query2#hash1',
  },
  {
    input: '?query1',
    base: '//auth2/dir2/file2?query2#hash2',
    href: '//auth2/dir2/file2?query1',
  },
  {
    input: 'file1',
    base: '//auth2/dir2/file2?query2#hash2',
    href: '//auth2/dir2/file1',
  },
  {
    input: 'dir1/',
    base: '//auth2/dir2/file2?query2#hash2',
    href: '//auth2/dir2/dir1/',
  },
  {
    input: '/dir1/',
    base: '//auth2/dir2/file2?query2#hash2',
    href: '//auth2/dir1/',
  },
  {
    input: '//auth1',
    base: '//auth2/dir2/file2?query2#hash2',
    href: '//auth1',
  },
  {
    input: 'sc1:',
    base: '//auth2/dir2/file2?query2#hash2',
    href: 'sc1:',
  },  

  // ord (base) === scheme
  {
    input: '#hash1',
    base: 'sc2://auth2/dir2/file2?query2#hash2',
    href: 'sc2://auth2/dir2/file2?query2#hash1',
  },
  {
    input: '?query1',
    base: 'sc2://auth2/dir2/file2?query2#hash2',
    href: 'sc2://auth2/dir2/file2?query1',
  },
  {
    input: 'file1',
    base: 'sc2://auth2/dir2/file2?query2#hash2',
    href: 'sc2://auth2/dir2/file1',
  },
  {
    input: 'dir1/',
    base: 'sc2://auth2/dir2/file2?query2#hash2',
    href: 'sc2://auth2/dir2/dir1/',
  },
  {
    input: '/dir1/',
    base: 'sc2://auth2/dir2/file2?query2#hash2',
    href: 'sc2://auth2/dir1/',
  },
  {
    input: '//auth1',
    base: 'sc2://auth2/dir2/file2?query2#hash2',
    href: 'sc2://auth1',
  },
  {
    input: 'sc1:',
    base: 'sc2://auth2/dir2/file2?query2#hash2',
    href: 'sc1:',
  },  

]