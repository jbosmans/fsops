# fsops
fsops operates on files and directories in a serial synchronuous way. Includes mkdirs, recursive delete, copy changed, reapply changes

Core operations:
- copyFile : copies files unless same contents exist at that path
- copyUpdated : copies new and updated files and directories
- listRecursively
- mkdirs
- deleteRecursively
- showChangesToReapply : performs a diff between a 2 dirs considered 'newer' and 'older'.
- reapplyChanges : applies changes needed to get another dir in the same state

Example:

```js
// require the fsops module
var fsops = require("fsops");

// copy a file
var copied = fsops.copyFile('/tmp/test.txt', '/tmp/test2.txt')
// copied will be true unless test2.txt already existed with same content

// copy all new and updated files below myUpdatedDir to myOlderVersionDir
var changeCount = fsops.copyUpdated('/tmp/myUpdatedDir', '/tmp/myOlderVersionDir')
// changeCount shows the number of files


// lists recursively, returning the full paths
var paths = fsops.listRecursively('/home/jbosmans')
// paths is an array of filepaths

// lists recursively, returning the data
var metaArray = fsops.listRecursivelyMeta('/home/jbosmans')
// array of instances of fsops.ListedPathMeta

// delete recursively
var deletedCount = fsops.deleteRecursively('/tmp/bigDir')

// creates necessary parents for 'myDir' to be created
var createdCount = fsops.mkdirsSync('/tmp/my/new/myDir')

// calculate a diff between updatedDir and olderDir:
// which operations are required to get olderDir in the same state as updatedDir
// returns an instance of fsops.DirectoryChangesMeta
var meta = fsops.showChangesToReapply('/tmp/updatedDir', '/tmp/olderDir')
// meta is an instance of fsops.DirectoryChangesMeta

// reapplie changes that were made to updatedDir to olderDir
// so that olderDir ends up in the same state as updatedDir
fsops.reapplyChangesToDir('/tmp/updatedDir', '/tmp/olderDir')
var equal = fsops.equalContent('/tmp/someDir', '/tmp/otherDir')
// equal will be true if both dirs have same child dirs and files with same content (per checksum)

//calculate a unified view of changes, showing only top level added and deleted directories.
var meta = fsops.showChangesToReapply('/tmp/updatedDir', '/tmp/olderDir'))
var summary = fsops.createSummaryOfChanges(meta);

//generates output to console
fsops.logDiffSummary(meta);

```

fsops is licensed under the Apache License, Version 2.0