/*
 * Copyright 2015 Jonathan Bosmans
 *
 *    Licensed under the Apache License, Version 2.0 (the "License");
 *    you may not use this file except in compliance with the License.
 *    You may obtain a copy of the License at
 *
 *        http://www.apache.org/licenses/LICENSE-2.0
 *
 *    Unless required by applicable law or agreed to in writing, software
 *    distributed under the License is distributed on an "AS IS" BASIS,
 *    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *    See the License for the specific language governing permissions and
 *    limitations under the License.
 */

var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var isBinaryFile = require("isbinaryfile").sync;

var debug = false;


var fsops = {};

fsops.CODE_ADDED= "added";
fsops.CODE_UPDATED= "updated";
fsops.CODE_DELETED= "deleted";
fsops.CODE_SAME= "same";


/**
 * Metadata for a file or directory
 * @param {String} filePath
 * @param {String} relativePath
 * @param {Number} depth
 * @param {fs.Stats} Stats
 * @constructor
 */
fsops.ListedPathMeta = function (filePath, relativePath, depth, Stats) {

    /**
     * @type {String}
     */
    this.path = filePath;

    /**
     * @type {boolean}
     */
    this.dir = Stats.isDirectory();
    /**
     * @type {String}
     */
    this.relativePath = relativePath;
    /**
     * @type {Number}
     */
    this.atime = Stats.atime.getTime();
    /**
     * @type {Number}
     */
    this.ctime = Stats.ctime.getTime();
    /**
     * @type {Number}
     */
    this.mtime = Stats.mtime.getTime();

    /**
     * @type {Number}
     */
    this.size = Stats.size;
    /**
     * @type {Number}
     */
    this.depth = depth;
};


/**
 * Copies the file at source path to target path if the checksum it doesn't exist or has a different checksum
 * @param {String} sourceFilePath The path to the source file that will be copied
 * @param {String} targetFilePath The target path whereto the source file will be copied
 * @return {boolean} true if a file was created
 */
fsops.copyFile = function (sourceFilePath, targetFilePath) {
    var sourceFileContents = fs.readFileSync(sourceFilePath);
    if (fs.existsSync(sourceFilePath) && fs.existsSync(targetFilePath)) {
        var sc = checksumFile(sourceFilePath);
        var tc = checksumFile(targetFilePath);
        if (sc !== tc) {
            fs.writeFileSync(targetFilePath, sourceFileContents);
            return true;
        } else {
            if (debug)console.log("Not writing unchanged " + sourceFilePath + " -> " + targetFilePath);
            return false;
        }
    } else {
        fs.writeFileSync(targetFilePath, sourceFileContents);
        return true;
    }

};
/**
 * Generates a checksum for the file at filePath
 * If the file is text file, different line endings will be
 * @param {String} filePath the file for which to generate a checksum
 * @param {String} [algo] the algorithm to use, defaults to 'sha1'
 * @returns {String} the checksum
 */
function checksumFile(filePath, algo) {
    var theAlgo = algo;
    if(typeof algo !== 'string'){
        theAlgo = 'sha1';

    }
    if (isBinaryFile(filePath)) {
        return crypto
            .createHash(theAlgo)
            .update(fs.readFileSync(filePath))
            .digest('hex');
    } else {
        return crypto
            .createHash(theAlgo)
            .update(convertAllLineEndingEncodingsToLineFeed(fs.readFileSync(filePath).toString()), 'utf8')
            .digest('hex');
    }


}

function convertAllLineEndingEncodingsToLineFeed(str) {
    return str.replace(/\r?\n|\r/g, '\n');
}


/**
 * Merge copies changed files and directories from sourcePath into targetPath
 * @param {String} sourcePath must point to an existing directory or file
 * @param {String} targetPath may exist or will be created
 * @return {Number} the number of changes (files/dirs created/copied)
 */
fsops.copyUpdated = function(sourcePath, targetPath) {
    var copyOps = [];
    if (!fs.existsSync(sourcePath)) {
        throw new Error("Copy source does not exist: " + sourcePath);
    }
    var sourceStat = fs.statSync(sourcePath);

    if (sourceStat.isFile()) {
        if (fs.existsSync(targetPath)) {
            if (fs.statSync(targetPath).isDirectory()) {
                fsops.deleteRecursively(targetPath)
            }
            fsops.copyFile(sourcePath, targetPath)
        } else {
            fsops.copyFile(sourcePath, targetPath);

        }
        return 1;
    }
    var sourceDirPath = sourcePath;
    var targetDirPath = targetPath;

    var targetDirExisted = fs.existsSync(targetDirPath);
    if (!targetDirExisted) {
        fsops.mkdirsSync(targetDirPath);
    }

    function processDir(sourceDir, targetDir) {
        var directChildren = fs.readdirSync(sourceDir);

        directChildren.forEach(function (cfn) {
            var sourcePath = sourceDir + path.sep + cfn;
            var targetPath = targetDir + path.sep + cfn;
            copyOps.push({
                source: sourcePath,
                target: targetPath,
                dir: fs.statSync(sourcePath).isDirectory()
            });
        });
    }

    function processCopyOp(copyOp) {
        var targetExists = fs.existsSync(copyOp.target);
        var targetOkType;
        if (copyOp.dir) {
            if (targetExists) {
                targetOkType = fs.statSync(copyOp.target).isDirectory();
                if (!targetOkType) {
                    fs.unlinkSync(copyOp.target);
                    fs.mkdirSync(copyOp.target);
                    //dirsCreated++;
                }
            } else {
                fs.mkdirSync(copyOp.target);
                //dirsCreated++;
            }
            processDir(copyOp.source, copyOp.target);
        } else {
            if (targetExists) {
                var targetStat = fs.statSync(copyOp.target);
                targetOkType = targetStat.isFile();
                if (!targetOkType) {
                    if (targetStat.isDirectory()) {
                        fsops.deleteRecursively(copyOp.target)
                    }
                }
            }
            fsops.copyFile(copyOp.source, copyOp.target);
        }
    }

    processDir(sourceDirPath, targetDirPath);

    var done = 0;
    while (copyOps.length > 0) {
        var op = copyOps.shift();
        processCopyOp(op);
        done++;
    }
    if (!targetDirExisted) {
        done++;
    }
    if (debug)console.log("Copied " + done + " items from " + sourceDirPath + " -> " + targetDirPath);
    return done;
};

/**
 * Lists all full paths below sourceDir, ignoring any ignoredNames
 * @param {String} sourceDirPath
 * @param {String[]|String} [ignoredNames] can contain relative paths (to sourcePath) or wildcard expressions (evaluated agains full path)
 * @param {boolean} [followSymbolicLinks]
 * @returns {String[]} the paths of all files below sourceDir
 */
fsops.listRecursively = function(sourceDirPath, ignoredNames, followSymbolicLinks) {
    var childPaths = fsops.listRecursivelyMeta(sourceDirPath, ignoredNames, followSymbolicLinks);
    var paths = childPaths.map(function (e) {
        return e.path;
    });
    paths.sort();
    return paths;
};

/**
 * Lists all full paths below sourceDir, ignoring any ignoredNames
 * ignoredNames can contain relative paths (to sourcePath) or wildcard expressions (evaluated agains full path)
 * @param {String} sourceDirPath
 * @param {String[]|String} [ignoredNames] can contain relative paths (to sourcePath) or wildcard expressions (evaluated agains full path)
 * @returns {fsops.ListedPathMeta[]}
 * @param {boolean} followSymbolicLinks
 */
fsops.listRecursivelyMeta = function(sourceDirPath, ignoredNames, followSymbolicLinks) {

    if(typeof followSymbolicLinks !== 'boolean'){
        followSymbolicLinks = true;
    }

    if (!fs.existsSync(sourceDirPath)) {
        throw new Error("Path to delete does not exist: " + sourceDirPath);
    }

    var sourceDirStats = fs.statSync(sourceDirPath);
    if (!sourceDirStats.isDirectory()) {
        throw new Error("not a directory: " + sourceDirPath);
    }
    if(sourceDirPath.length > 1 && sourceDirPath.charAt(sourceDirPath.length-1) === '/'){
        sourceDirPath = sourceDirPath.substring(0, sourceDirPath.length-1);
    }
    var ignoredHash = {};
    if (typeof ignoredNames === 'string') {
        ignoredNames = [ignoredNames];
    }

    var quoteRegExp = function (str) {
        return (str + '').replace(/[.?+^$[\]\\(){}|-]/g, "\\$&");
    };
    var wildcardExp = [];

    if (ignoredNames) {
        ignoredNames.forEach(function (n) {
            if (n.indexOf('*') >= 0) {
                var exp = '^' + quoteRegExp(n).replace(/[*]/g, '.*') + '$';
                console.log("EXPRESSION=", exp);

                wildcardExp.push(new RegExp(exp));
            } else {
                if (!path.isAbsolute(n)) {
                    ignoredHash[sourceDirPath + path.sep + n] = 1;
                } else {
                    ignoredHash[n] = 1;
                }
            }


        });
    }
    function isIgnoredPath(fsPath) {
        if (ignoredHash.hasOwnProperty(fsPath)) {
            return true;
        }
        if (wildcardExp.length > 0) {
            var ignored = false;
            for (var i = 0; !ignored && i < wildcardExp.length; i++) {
                var matches = wildcardExp[i].exec(fsPath);
                if (matches && matches.length === 1 && matches[0] === fsPath) {
                    ignored = true;
                }
            }
            return ignored;
        }
        return false;
    }

    var childPaths = [];

    var couldNotList = [];

    /**
     * @param {String} fsDirPath
     * @param {Number} depth
     *
     */
    function listDir(fsDirPath, depth) {
        if (!isIgnoredPath(fsDirPath)) {
            try {
                var directChildren = fs.readdirSync(fsDirPath);
                directChildren.forEach(function (cfn) {
                    var sourcePath = fsDirPath + path.sep + cfn;
                    if (!isIgnoredPath(sourcePath)) {
                        var stat = fs.lstatSync(sourcePath);
                        var skip = false;
                        if(stat.isSymbolicLink()){
                            if(followSymbolicLinks){
                                var linkTarget = fs.readlinkSync(sourcePath);
                                //console.log("SYMB " + sourcePath + " => " + linkTarget);
                                if(linkTarget === '.' || linkTarget === '..' || sourcePath.indexOf(linkTarget) === 0){
                                    console.error("# Ignoring illegal symbolic link dir: " + sourcePath + " => " + linkTarget );
                                    skip = true;
                                }
                            }else{
                                console.error("# Not following symbolic link: " + sourcePath);
                                skip = true;
                            }
                        }
                        if(!skip){
                            var relativePath = sourcePath.substring(fsDirPath.length + 1);
                            childPaths.push(new fsops.ListedPathMeta(sourcePath, relativePath, depth, stat));
                            if(childPaths.length%10000===0){
                                console.error("Listed " + childPaths.length + " files ...");
                            }
                        }
                    }
                });
            } catch (e) {
                couldNotList.push(fsDirPath);
            }
        }
    }

    listDir(sourceDirPath, 1);
    for (var i = 0; i < childPaths.length; i++) {
        var op = childPaths[i];
        if (op.dir) {
            listDir(op.path, op.depth);
        }
    }
    if (couldNotList.length > 0) {
        console.warn("# Warning: Could not list " + couldNotList.length + " files below " + sourceDirPath + ":\n" + couldNotList.join('\n'));

    }
    return childPaths;
};


/**
 * Recursively deletes the passed directory (or file if needed)
 * @throws Error if the sourceDir does not exist
 * @param {String} dirPath a path pointing to a directory (or file)
 * @return {Number} total number of files and directories deleted
 */
fsops.deleteRecursively = function(dirPath) {
    if (!fs.existsSync(dirPath)) {
        throw new Error("Path to delete does not exist: " + dirPath);
    }
    if (!fs.statSync(dirPath).isDirectory()) {
        fs.unlinkSync(dirPath);
        return 1;
    }

    var deleteActions = 0;

    var deleteOps = [];

    function deleteDir(sourceDir, depth) {
        var directChildren = fs.readdirSync(sourceDir);
        directChildren.forEach(function (cfn) {
            var sourcePath = sourceDir + path.sep + cfn;
            deleteOps.push({
                path: sourcePath,
                dir: fs.statSync(sourcePath).isDirectory(),
                depth: depth
            });
        });
    }

    deleteDir(dirPath, 1);
    for (var i = 0; i < deleteOps.length; i++) {
        var op = deleteOps[i];
        if (op.dir) {
            deleteDir(op.path, op.depth + 1);
        }
    }
    deleteOps.splice(0, 0, {
        path: dirPath,
        dir: true,
        depth: 0
    });
    deleteOps.sort(function (a, b) {
        if (a.dir && !b.dir) {
            return 1;
        }
        if (!a.dir && b.dir) {
            return -1
        }
        return (a.depth - b.depth) * -1;
    });
    //var todel = deleteOps.length;
    while (deleteOps.length > 0) {
        var delOp = deleteOps.shift();
        if (delOp.dir) {
            fs.rmdirSync(delOp.path);
        } else {
            fs.unlinkSync(delOp.path);
        }
        deleteActions++;
    }
    if (debug)console.log("Finished deleting " + dirPath + ": " + deleteActions + " files & dirs deleted");
    return deleteActions;
};


/**
 * Creates a directory at dirPath including any needed parent directories
 * @param {String} dirPath where the directory will be created
 * @throws an error when there is a non-directory file at dirPath
 * @return {Number} the number of directories that were created
 */
fsops.mkdirsSync = function(dirPath) {
    var thePath = path.normalize(dirPath);
    if (fs.existsSync(thePath)) {
        if (fs.statSync(thePath).isDirectory()) {
            return 0;
        } else {
            throw new Error("There is a non-dir at path " + thePath);
        }
    }
    var toCreate = [];
    var creationCount = 0;
    var dp = '' + thePath;
    while (!fs.existsSync(dp)) {
        var lastSep = dp.lastIndexOf(path.sep);
        var lastPart = dp.substring(lastSep + 1);
        //console.log(".. so adding to tocreate: " + lastPart);
        toCreate.unshift(lastPart);
        dp = dp.substring(0, lastSep);
    }
    toCreate.forEach(function (part) {
        var ndp = dp + path.sep + part;
        fs.mkdirSync(ndp);
        creationCount++;
        dp = ndp;
    });
    return creationCount;

};
/**
 *
 * @param {fsops.ListedPathMeta} a
 * @param {fsops.ListedPathMeta} b
 * @return {number}
 */
function sortPathFn(a, b) {
    var ap = a.path, bp = b.path;
    if (ap > bp) {
        return 1;
    } else if (ap < bp) {
        return -1;
    } else {
        return 0;
    }
}
/**
 * Returns true if the file is readable
 * @param {String} filePath
 * @returns {boolean}
 */
function isReadablePath(filePath) {
    try {
        fs.accessSync(filePath, fs.R_OK);
        return true;
    } catch (e) {
        if (e.code === 'EACCES') {
            return false;
        } else if (e.code === 'ENOENT') {
            return false;
        }
        //if/when we get other errors, add handling
        throw e;
    }
}
/**
 * A data structure results of fsops.showChangesToReapply
 * @param arg
 * @constructor
 */
fsops.DirectoryChangesMeta = function(arg){
    /**
     * @type {fsops.ListedPathMeta[]}
     */
    this.added = arg.added;
    /**
     * @type {fsops.ListedPathMeta[]}
     */
    this.updated = arg.updated;
    /**
     * @type {fsops.ListedPathMeta[]}
     */
    this.deleted = arg.deleted;
    /**
     * @type {fsops.ListedPathMeta[]}
     */
    this.unchanged = arg.unchanged;
    /**
     * @type {Number}
     */
    this.sourceChildren = arg.sourceChildren;
    /**
     * @type {Number}
     */
    this.targetChildren = arg.targetChildren;
    /**
     * @type {fsops.ListedPathMeta[]}
     */
    this.unprocessedSource = arg.unprocessedSource;
    /**
     * @type {fsops.ListedPathMeta[]}
     */
    this.unprocessedTarget = arg.unprocessedTarget;
    /**
     * @type {fsops.ListedPathMeta[]}
     */
    this.unreadablePaths = arg.unreadablePaths;
    /**
     * @type {Number}
     */
    this.changeCount = arg.changeCount;
    /**
     * @type {String}
     */
    this.changedDir = arg.changedDir;
    /**
     * @type {String}
     */
    this.applyToDir = arg.applyToDir;
    /**
     * @type {fsops.ListedPathMeta[]}
     */
    this.status = arg.status;
    /**
     * @type {fsops.ListedPathMeta[]}
     */
    this.statusChanged = arg.statusChanged;
    /**
     * @type {fsops.ListedPathMeta[]}
     */
    this.deletedDirs = arg.deletedDirs;
    /**
     * @type {fsops.ListedPathMeta[]}
     */
    this.addedTopLevel = arg.addedTopLevel;
    /**
     * @type {fsops.ListedPathMeta[]}
     */
    this.deletedTopLevel = arg.deletedTopLevel;

};

/**
 * Calculates the differences between sourceDirPath and targetDirPath.
 * Can be used to apply necessary changes to targetDir to get it into the same state as sourceDir (same child dirs/files/contents)
 * @param {String} sourceDirPath
 * @param {String} targetDirPath
 * @param {String[]|String} [ignoreNames] can contain relative paths (to sourcePath) or wildcard expressions (evaluated agains full path)
 * @returns {fsops.DirectoryChangesMeta}
 */
fsops.showChangesToReapply = function(sourceDirPath, targetDirPath, ignoreNames) {
    if (!fs.existsSync(sourceDirPath)) {
        throw new Error("changedDir path does not exist: " + sourceDirPath);
    }
    if (!fs.existsSync(targetDirPath)) {
        throw new Error("applyToDir path does not exist: " + targetDirPath);
    }

    var changedChildren = fsops.listRecursivelyMeta(sourceDirPath, ignoreNames).map(function (c) {
        c.relativePath = c.path.substring(sourceDirPath.length + 1);
        return c;
    });

    var applyToChildren = fsops.listRecursivelyMeta(targetDirPath, ignoreNames).map(function (c) {
        c.relativePath = c.path.substring(targetDirPath.length + 1);
        return c;
    });

    var changedChildrenMap = {};

    changedChildren.forEach(function (c) {
        changedChildrenMap[c.relativePath] = c;
    });
    var applyToChildrenMap = {};

    applyToChildren.forEach(function (c) {
        applyToChildrenMap[c.relativePath] = c;
    });
    var added = [], deleted = [], updated = [], unchanged = [];
    var noAccessPaths = [];
    var couldNotProcessSource = [];
    var couldNotProcessTarget = [];
    changedChildren.forEach(function (sourcePathInfo) {
        var didntExist = !applyToChildrenMap.hasOwnProperty(sourcePathInfo.relativePath);
        if (didntExist) {
            added.push(sourcePathInfo);
        } else {
            var targetPathInfo = applyToChildrenMap[sourcePathInfo.relativePath];
            var sameTypeFiles = sourcePathInfo.dir === targetPathInfo.dir;
            if (sameTypeFiles) {
                if (sourcePathInfo.dir) {
                    unchanged.push(sourcePathInfo);
                } else {

                    var sourceReadable = isReadablePath(sourcePathInfo.path);
                    var targetReadable = isReadablePath(targetPathInfo.path);
                    if (sourceReadable && targetReadable) {
                        var cCheck = checksumFile(sourcePathInfo.path);
                        var oCheck = checksumFile(targetPathInfo.path);
                        if (cCheck !== oCheck) {
                            updated.push(sourcePathInfo);
                        } else {
                            unchanged.push(sourcePathInfo);
                        }
                    } else {
                        if (!sourceReadable) {
                            noAccessPaths.push(sourcePathInfo);
                        }
                        if (!targetReadable) {
                            noAccessPaths.push(targetPathInfo);
                        }
                        couldNotProcessSource.push(sourcePathInfo);
                        couldNotProcessTarget.push(targetPathInfo);
                    }

                }
            } else {
                updated.push(sourcePathInfo);
            }
        }
    });

    applyToChildren.forEach(function (c) {
        var noLongerThere = !changedChildrenMap.hasOwnProperty(c.relativePath);
        if (noLongerThere) {
            deleted.push(c);
        }
    });

    added.sort(sortPathFn);
    deleted.sort(sortPathFn);
    updated.sort(sortPathFn);
    unchanged.sort(sortPathFn);
    noAccessPaths.sort(sortPathFn);
    couldNotProcessSource.sort(sortPathFn);
    couldNotProcessTarget.sort(sortPathFn);
    var o = {
        added: added,
        deleted: deleted,
        updated: updated,
        unchanged: unchanged,
        sourceChildren: applyToChildren.length,
        targetChildren: changedChildren.length,
        unprocessedSource: couldNotProcessSource,
        unprocessedTarget: couldNotProcessTarget,
        unreadablePaths: noAccessPaths,
        changeCount: added.length + deleted.length + updated.length,
        changedDir: sourceDirPath,
        applyToDir: targetDirPath,
        status: [],
        statusChanged: [],
        deletedDirs: [],
        deletedTopLevel : [],
        addedTopLevel: []

    };

    function retainTopLevel(deleted) {
        if (deleted.length > 0) {
            var dirs = deleted.filter(function (c) {
                return c.dir;
            });
            var topLevel = [];

            function alreadyContained(c) {
                var cPath = c.path;
                var notFound = true;
                for (var i = 0; notFound && i < topLevel.length; i++) {
                    if (cPath.indexOf(topLevel[i].path + "/") === 0) {
                        notFound = false;
                    }
                }
                return !notFound;
            }

            dirs.forEach(function (c) {
                if (!alreadyContained(c)) {
                    topLevel.splice(0, 0, c);
                }
            });
            var topLevelAll = [];
            deleted.forEach(function (c) {
                if (!alreadyContained(c)) {
                    topLevelAll.splice(0, 0, c);
                }
            });
            return topLevelAll;
        } else {
            return [];
        }
    }

    var topLevelDeleted = retainTopLevel(o.deleted);
    var topLevelAdded = retainTopLevel(o.added);
    o.deletedTopLevel = topLevelDeleted;
    o.addedTopLevel = topLevelAdded;

    var bp = [];

    added.forEach(function (p) {

        bp.push({
            path: p,
            reason: fsops.CODE_ADDED
        });
    });
    updated.forEach(function (p) {

        bp.push({
            path: p,
            reason: fsops.CODE_UPDATED
        });
    });
    deleted.forEach(function (p) {

        bp.push({
            path: p,
            reason: fsops.CODE_DELETED
        });
    });
    bp.sort(function (a, b) {
        return sortPathFn(a.path, b.path)
    });
    o.statusChanged = [].concat(bp);

    unchanged.forEach(function (p) {

        bp.push({
            path: p,
            reason: fsops.CODE_SAME
        })
    });
    bp.sort(function (a, b) {
        return sortPathFn(a.path, b.path)
    });
    o.status = bp;
    // mark dirs that have been modified ?
    return new fsops.DirectoryChangesMeta(o);
};

/**
 * Reapplies the changes made to sourceDir to targetDir in order to get targetDir in the same state as sourceDir (same child dirs/files/contents)
 * @param {String} sourceDir
 * @param {String} targetDir
 * @param {String[]|String} [ignoredNames] can contain relative paths (to sourcePath) or wildcard expressions (evaluated agains full path)
 * @returns {{created: fsops.ListedPathMeta[], deleted: fsops.ListedPathMeta[], updated: fsops.ListedPathMeta[]}}
 */
fsops.reapplyChangesToDir = function(sourceDir, targetDir, ignoredNames) {
    var c = fsops.showChangesToReapply(sourceDir, targetDir, ignoredNames);
    var o = {
        created: [],
        deleted: [],
        updated: []

    };
    /**
     * @param {fsops.ListedPathMeta} p
     */
    var processAdded = function (p) {
        var targetPath = path.resolve(targetDir, p.relativePath);
        console.log("ADDED : copying " + p.path + " -> " + targetPath);
        if (p.dir) {
            fsops.mkdirsSync(p.path);
        } else {
            var parentDir = path.dirname(targetPath);
            if (!fs.existsSync(parentDir)) {
                fsops.mkdirsSync(parentDir);
            }
            fsops.copyFile(p.path, targetPath);
        }

        o.created.push(p);

    };
    /**
     * @param {fsops.ListedPathMeta} p
     */
    var processDeleted = function (p) {
        console.log("DELETED : deleting " + p.path + " because " + p.relativePath + " is not found at " + sourceDir + path.sep + p.relativePath);
        if (p.dir && fs.existsSync(p.path)) {
            fsops.deleteRecursively(p.path);
        } else {
            if (fs.existsSync(p.path)) {
                fs.unlinkSync(p.path);
            }

        }

        o.deleted.push(p);
    };
    /**
     * @param {fsops.ListedPathMeta} p
     */
    var processUpdated = function (p) {
        var targetPath = path.resolve(targetDir, p.relativePath);
        console.log("UPDATED : copying latest from " + p.path + " -> " + targetPath);
        fsops.copyFile(p.path, targetPath);
        o.updated.push(p);
    };
    c.added.forEach(processAdded);
    c.deleted.forEach(processDeleted);
    c.updated.forEach(processUpdated);
    o.changeCount = o.created.length + o.deleted.length + o.updated.length;
    return o;
};

/**
 * Returns true if both passed directories have equal contents: same dirs and files with same content
 * @param {String} sourcePath
 * @param {String} targetPath
 * @param {String[]|String} [ignoreNames]
 * @returns {boolean}
 */
fsops.equalContent = function(sourcePath, targetPath, ignoreNames) {
    var sStat = fs.statSync(sourcePath);
    var tStat = fs.statSync(sourcePath);
    if (sStat.isDirectory() !== tStat.isDirectory()) {
        return false;
    }
    if (sStat.isDirectory()) {
        return fsops.showChangesToReapply(sourcePath, targetPath, ignoreNames).changeCount === 0;
    } else if (sStat.isFile()) {
        return checksumFile(sourcePath) === checksumFile(targetPath);
    } else {
        throw new Error("undefined; not both dir and not both file : " + sourcePath + " <-> " + targetPath);
    }
};
/**
 *
 * @param {fsops.ListedPathMeta} path
 * @param {String} status
 * @param {String} code
 * @constructor
 */
fsops.PathStatus = function(path, status, code){
    this.path = path;
    this.status = status;
    this.code = code;
};

/**
 *
 * @param {fsops.DirectoryChangesMeta} changesMeta
 * @param {boolean} [includeUnchanged]
 * @returns {fsops.PathStatus[]}
 */
fsops.createSummaryOfChanges = function(changesMeta, includeUnchanged) {
    var all = [];
    changesMeta.addedTopLevel.forEach(function (c) {
        all.push(new fsops.PathStatus(c,"+",fsops.CODE_ADDED));
    });
    changesMeta.deletedTopLevel.forEach(function (c) {
        all.push(new fsops.PathStatus(c,"-",fsops.CODE_DELETED));
    });
    changesMeta.updated.forEach(function (c) {
        all.push(new fsops.PathStatus(c,"~",fsops.CODE_UPDATED));
    });
    if (includeUnchanged) {
        changesMeta.unchanged.forEach(function (c) {
            all.push(new fsops.PathStatus(c,"=",fsops.CODE_SAME));
        });
    }

    all.sort(function (a, b) {
        return sortPathFn(a.path, b.path);
    });
    return all;
};
/**
 * Logs a summarazing view of the changes to the console
 * @param {fsops.DirectoryChangesMeta} changesMeta
 * @param {boolean} [includeUnchanged]
 */
fsops.logDiffSummary = function(changesMeta, includeUnchanged) {
    var summary = fsops.createSummaryOfChanges(changesMeta, includeUnchanged);

    summary.forEach(function (sp) {
        var dirCounts = "";
        var refPath = sp.path.path + "/";
        if (sp.path.dir) {
            var childCount = changesMeta.status.filter(function (osp) {

                return osp.path.path.indexOf(refPath) === 0;
            }).length;
            dirCounts = " (" + childCount + " children)";
        }
        console.log(sp.status + (sp.path.dir ? "d " : "f ") + sp.path.relativePath + dirCounts);
    });
    console.warn("# Total changed=" + changesMeta.changeCount + " unchanged=" + changesMeta.unchanged.length);
    console.warn("# Changes: added=" + changesMeta.added.length + " updated=" + changesMeta.updated.length + " deleted=" + changesMeta.deleted.length);
    if (changesMeta.unreadablePaths.length > 0) {
        console.warn("# Warning: could not read " + changesMeta.unreadablePaths.length + " paths");
    }
};

module.exports = fsops;