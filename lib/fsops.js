var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var isBinaryFile = require("isbinaryfile").sync;
var streams = false;
var debug = false;




var diffStates = {
    CODE_ADDED : "added",
    CODE_UPDATED : "updated",
    CODE_DELETED : "deleted",
    CODE_SAME : "same"
};

var CODE_ADDED = diffStates.CODE_ADDED;
var CODE_UPDATED = diffStates.CODE_UPDATED;
var CODE_DELETED = diffStates.CODE_DELETED;
var CODE_SAME = diffStates.CODE_SAME;

/**
 *
 * @param source String
 * @param target
 */
function copyFile(source, target){
    if (streams) {
        var instr = fs.createReadStream(source);
        var outstr = fs.createWriteStream(target);
        instr.pipe(outstr);
    } else {
        var sourceFileContents = fs.readFileSync(source);
        if(fs.existsSync(source) && fs.existsSync(target)){
            var sc = checksumFile(source);
            var tc = checksumFile(target);
            if(sc !== tc){
                fs.writeFileSync(target, sourceFileContents);
            }else{
                if(debug)console.log("Not writing unchanged " + source + " -> " + target);
            }
        }else{
            fs.writeFileSync(target, sourceFileContents);
        }
    }
}

function checksumFile (filePath) {
    if(isBinaryFile(filePath)){
        return crypto
            .createHash('sha1')
            .update(fs.readFileSync(filePath))
            .digest('hex');
    }else{
        return crypto
            .createHash('sha1')
            .update(lineEndingsToLineFeed(fs.readFileSync(filePath).toString()), 'utf8')
            .digest('hex');
    }


}

function lineEndingsToLineFeed(str){
    return str.replace(/\r?\n|\r/g, '\n');
}


/**
 * Copies and merges in files from sourceDir into targetDir
 * @param sourceDir must exist
 * @param targetDir may exist or will be created
 */
function copyUpdated(sourceDir, targetDir) {
    var copyOps = [];
    if(!fs.existsSync(sourceDir)){
        throw new Error("Copy source does not exist: " + sourceDir);
    }

    if(!fs.existsSync(targetDir)){
        mkdirsSync(targetDir);
    }else{
        if(!fs.statSync(targetDir).isDirectory()){
            processCopyOp({
                source:sourceDir,
                target:targetDir,
                dir:false
            });
            if(debug)console.info("Copied file " + sourceDir + " -> " + targetDir);
            return;
        }
    }

    function processDir(sourceDir, targetDir){
        var directChildren = fs.readdirSync(sourceDir);

        directChildren.forEach(function(cfn){
            var sourcePath = sourceDir + path.sep + cfn;
            var targetPath = targetDir + path.sep + cfn;
            copyOps.push({
                source: sourcePath,
                target: targetPath,
                dir : fs.statSync(sourcePath).isDirectory()
            });
        });
    }

    function processCopyOp(copyOp){
        var targetExists = fs.existsSync(copyOp.target);
        var targetOkType;
        if(copyOp.dir){
            if(targetExists){
                targetOkType = fs.statSync(copyOp.target).isDirectory();
                if(!targetOkType){
                    fs.unlinkSync(copyOp.target);
                    fs.mkdirSync(copyOp.target);
                    //dirsCreated++;
                }
            }else{
                fs.mkdirSync(copyOp.target);
                //dirsCreated++;
            }
            processDir(copyOp.source, copyOp.target);
        }else{
            if(targetExists){
                var targetStat = fs.statSync(copyOp.target);
                targetOkType = targetStat.isFile();
                if(!targetOkType){
                    if(targetStat.isDirectory()){
                        deleteRecursively(copyOp.target)
                    }
                }
            }
            copyFile(copyOp.source, copyOp.target);
        }
    }
    processDir(sourceDir, targetDir);
    var done = 0;
    while(copyOps.length > 0){
        var op = copyOps.shift();
        processCopyOp(op);
        done++;
    }
    if(debug)console.log("Copied " + done  + " items from " + sourceDir + " -> " + targetDir);
}

function listDirChildrenFullPathsRecursively(sourceDir, ignoredNames){
    var childPaths = listDirChildrenFullPathsRecursivelyFull(sourceDir, ignoredNames);
    var paths = childPaths.map(function(e){
        return e.path;
    });
    paths.sort();
    return paths;
}

function listDirChildrenFullPathsRecursivelyFull(sourceDir, ignoredNames){
    if(!fs.existsSync(sourceDir)){
        throw new Error("Path to delete does not exist: " + sourceDir);
    }

    if(!fs.statSync(sourceDir).isDirectory()){
        throw new Error("not a directory: " + sourceDir);
    }

    var ignoredHash = {};
    if(typeof ignoredNames === 'string'){
        ignoredNames = [ignoredNames];
    }

    var quoteRegExp = function(str) {
        return (str+'').replace(/[.?+^$[\]\\(){}|-]/g, "\\$&");
    };
    var wildcardExp = [];

    if(ignoredNames){
        ignoredNames.forEach(function(n){
            if(n.indexOf('*') >= 0){
                var exp =  '^' + quoteRegExp(n).replace(/[*]/g, '.*') + '$';
                console.log("EXPRESSION=", exp);

                wildcardExp.push(new RegExp(exp));
            }else{
                if(!path.isAbsolute(n)){
                    ignoredHash[sourceDir + path.sep + n] = 1;
                }else{
                    ignoredHash[n] = 1;
                }
            }


        });
    }
    function isIgnoredPath(fsPath){
        if(ignoredHash.hasOwnProperty(fsPath)){
            return true;
        }
        if(wildcardExp.length  >0){
            var ignored = false;
            for(var i = 0; !ignored && i < wildcardExp.length ; i++){
                var matches = wildcardExp[i].exec(fsPath);
                if(matches && matches.length === 1 && matches[0] === fsPath){
                    ignored = true;
                }
            }
            return ignored;
        }
        return false;
    }

    var childPaths = [];

    var couldNotList = [];

    function listDir(fsDirPath, depth){
        if(!isIgnoredPath(fsDirPath)){
            try {
                var directChildren = fs.readdirSync(fsDirPath);
                directChildren.forEach(function(cfn){
                    var sourcePath = fsDirPath + path.sep + cfn;
                    if(!isIgnoredPath(sourcePath)){
                        var stat = fs.statSync(sourcePath);
                        childPaths.push({
                            path: sourcePath,
                            relativePath: sourcePath.substring(fsDirPath.length+1),
                            dir : stat.isDirectory(),
                            depth: depth
                        });
                    }

                });
            } catch (e) {
                couldNotList.push(fsDirPath);
                //console.error("Could not list " + sourceDir, e);
            }
        }
    }
    listDir(sourceDir, 1);
    for(var i = 0; i < childPaths.length ; i++){
        var op = childPaths[i];
        if (op.dir) {
            listDir(op.path, op.depth + 1);
        }
    }
    if(couldNotList.length > 0){
        console.warn("Could not list " + couldNotList.length + " files below "+sourceDir+":\n"+ couldNotList.join('\n'));

    }
    return childPaths;
}



function deleteRecursively(sourceDir) {
    if(!fs.existsSync(sourceDir)){
        throw new Error("Path to delete does not exist: " + sourceDir);
    }
    if(!fs.statSync(sourceDir).isDirectory()){
        fs.unlinkSync(sourceDir);
        //console.log("Deleted file " + sourceDir);
        return;
    }

    var deleteOps = [];

    function deleteDir(sourceDir, depth){
        var directChildren = fs.readdirSync(sourceDir);
        directChildren.forEach(function(cfn){
            var sourcePath = sourceDir + path.sep + cfn;
            deleteOps.push({
                path: sourcePath,
                dir : fs.statSync(sourcePath).isDirectory(),
                depth: depth
            });
        });
    }
    deleteDir(sourceDir, 1);
    for(var i = 0; i < deleteOps.length ; i++){
        var op = deleteOps[i];
        if (op.dir) {
            deleteDir(op.path, op.depth + 1);
        }
    }
    deleteOps.splice(0, 0, {
        path: sourceDir,
        dir: true,
        depth: 0
    });
    deleteOps.sort(function(a,b){
        if(a.dir && !b.dir){
            return 1;
        }
        if(!a.dir && b.dir){
            return -1
        }
        return (a.depth - b.depth)*-1;
    });
    var todel = deleteOps.length;
    while(deleteOps.length > 0){
        var delOp = deleteOps.shift();
        if(delOp.dir){
            fs.rmdirSync(delOp.path);
        }else{
            fs.unlinkSync(delOp.path);
        }
    }
    if(debug)console.log("Finished deleting " + sourceDir + ": " + todel + " files & dirs deleted");
}

function mkdirsSync(dirPath){
    var thePath = path.normalize(dirPath);
    if(fs.existsSync(thePath)){
        if(fs.statSync(thePath).isDirectory()){
            return;
        }else{
            throw new Error("There is a non dir at path " + thePath);
        }
    }
    var toCreate = [];

    var dp = '' + thePath;
    while(!fs.existsSync(dp)){
        var lastSep = dp.lastIndexOf(path.sep);
        var lastPart = dp.substring(lastSep+1);
        //console.log(".. so adding to tocreate: " + lastPart);
        toCreate.unshift(lastPart);
        dp = dp.substring(0, lastSep);
    }
    toCreate.forEach(function(part){
        var ndp = dp + path.sep + part;
        fs.mkdirSync(ndp);
        dp = ndp;
    });

}

function sortPathFn(a,b){
    var ap = a.path, bp = b.path;
    if(ap > bp){
        return 1;
    }else if(ap < bp){
        return -1;
    }else{
        return 0;
    }
}

function showChangesToRepplyFlat(changedDir, applyToDir, ignoreNames){
    var o = showChangesToRepply(changedDir, applyToDir, ignoreNames);
    var toRelative = function (p) {
        return p.relativePath;
    };
    o.added = o.added.map(toRelative);
    o.updated = o.updated.map(toRelative);
    o.deleted = o.deleted.map(toRelative);
    o.unchanged = o.unchanged.map(toRelative);
    return o;
}

function isReadablePath(filePath){
    try {
        return fs.accessSync(filePath, fs.F_OK | fs.R_OK);
    } catch (e) {

        if(e.code === 'EACCES'){
            return false;
        }else if(e.code === 'ENOENT'){
            return false;
        }
        //if/when we get other errors, add handling
        throw e;
    }
}

function showChangesToRepply(changedDir, applyToDir, ignoreNames){
    if(!fs.existsSync(changedDir)){
        throw new Error("changedDir path does not exist: " + changedDir);
    }
    if(!fs.existsSync(applyToDir)){
        throw new Error("applyToDir path does not exist: " + applyToDir);
    }

    var changedChildren = listDirChildrenFullPathsRecursivelyFull(changedDir, ignoreNames).map(function(c){
        c.relativePath = c.path.substring(changedDir.length+1);
        return c;
    });
    // show items added
    // show items no longer there
    // show items updated

    var applyToChildren = listDirChildrenFullPathsRecursivelyFull(applyToDir, ignoreNames).map(function(c){
        c.relativePath = c.path.substring(applyToDir.length+1);
        return c;
    });

    var changedChildrenMap = {};

    changedChildren.forEach(function(c){
        changedChildrenMap[c.relativePath] = c;
    });
    var applyToChildrenMap = {};

    applyToChildren.forEach(function(c){
        applyToChildrenMap[c.relativePath] = c;
    });
    var added = [], deleted = [], updated = [], unchanged = [];
    var noAccessPaths = [];
    var couldNotProcessSource = [];
    var couldNotProcessTarget = [];
    changedChildren.forEach(function(c){
        var didntExist = !applyToChildrenMap.hasOwnProperty(c.relativePath);
        if(didntExist){
            added.push(c);
        }else{
            var other = applyToChildrenMap[c.relativePath];
            var bothDirOrFile = c.dir === other.dir;
            if(bothDirOrFile){
                if (c.dir) {
                    unchanged.push(c);
                } else {
                    var cReadable = isReadablePath(c.path);
                    var otherReadable = isReadablePath(other.path);
                    if(cReadable && otherReadable){
                        var cCheck = checksumFile(c.path);
                        var oCheck = checksumFile(other.path);
                        if (cCheck !== oCheck) {
                            updated.push(c);
                        } else {
                            unchanged.push(c);
                        }
                    }else{
                        if(!cReadable){
                            //console.info("Not readable: " + c.path);
                            noAccessPaths.push(c);
                        }
                        if(!cReadable){
                            //console.info("Not readable: " + other.path);
                            noAccessPaths.push(other);
                        }
                        couldNotProcessSource.push(c);
                        couldNotProcessTarget.push(other);
                    }

                }
            }else{
                updated.push(c);
            }
        }
    });

    applyToChildren.forEach(function(c){
        var noLongerThere = !changedChildrenMap.hasOwnProperty(c.relativePath);
        if(noLongerThere){
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
        added : added,
        deleted : deleted,
        updated : updated,
        unchanged : unchanged,
        sourceChildren : applyToChildren.length,
        targetChildren : changedChildren.length,
        unprocessedSource : couldNotProcessSource,
        unprocessedTarget : couldNotProcessTarget,
        unreadablePaths : noAccessPaths,
        changeCount : added.length + deleted.length + updated.length,
        changedDir: changedDir,
        applyToDir : applyToDir,
        status : [],
        statusChanged : [],
        deletedDirs: []

    };

    function retainTopLevel(deleted){
        if(deleted.length > 0){
            var dirs = deleted.filter(function(c){
                return c.dir;
            });

            //var topLevel = dirs.filter(function(c, idx){
            //    return idx === 0 || c.path.indexOf(dirs[idx-1].path) !== 0;
            //});
            //o.deletedDirs = topLevel;

            var topLevel = [];

            function alreadyContained(c){
                var cPath = c.path;
                var notFound = true;
                for(var i = 0; notFound && i < topLevel.length ; i++){
                    if(cPath.indexOf(topLevel[i].path + "/") === 0){
                        notFound = false;
                    }
                }
                return !notFound;
            }

            dirs.forEach(function(c){
                if(!alreadyContained(c)){
                    topLevel.splice(0, 0, c);
                }
            });


            var topLevelAll = [];
            deleted.forEach(function(c){
                if(!alreadyContained(c)){
                    topLevelAll.splice(0, 0, c);
                }
            });
            return topLevelAll;


        }else{
            return [];
        }
    }

    var topLevelDeleted = retainTopLevel(o.deleted);
    var topLevelAdded = retainTopLevel(o.added);
    o.deletedTopLevel = topLevelDeleted;
    o.addedTopLevel = topLevelAdded;

    var bp = [];

    added.forEach(function(p){

        bp.push({
            path: p,
            reason: CODE_ADDED
        });
    });
    updated.forEach(function(p){

        bp.push({
            path: p,
            reason: CODE_UPDATED
        });
    });
    deleted.forEach(function(p){

        bp.push({
            path: p,
            reason: CODE_DELETED
        });
    });
    bp.sort(function(a,b){
        return sortPathFn(a.path, b.path)
    });
    o.statusChanged = [].concat(bp);

    unchanged.forEach(function(p){

        bp.push({
            path:p,
            reason: CODE_SAME
        })
    });
    bp.sort(function(a,b){
        return sortPathFn(a.path, b.path)
    });
    o.status = bp;
    // mark dirs that have been modified ?
    return o;
}

function reapplyChangesToDir(sourceDir, targetDir, ignoredNames){
    var c = showChangesToRepply(sourceDir, targetDir, ignoredNames);
    var o = {
        created: [],
        deleted: [],
        updated: []

    };
    c.added.forEach(function(p){
        var targetPath = path.resolve(targetDir, p.relativePath);

        console.log("ADDED : copying " + p.path + " -> " + targetPath);
        if(p.dir){
            mkdirsSync(p.path);
        }else{
            var parentDir = path.dirname(targetPath);
            if(!fs.existsSync(parentDir)){
                mkdirsSync(parentDir);
            }
            copyFile(p.path, targetPath);
        }

        o.created.push(p);

    });
    c.deleted.forEach(function(p){
        console.log("DELETED : deleting " + p.path + " because " + p.relativePath + " is not found at " + sourceDir + path.sep + p.relativePath);
        if(p.dir && fs.existsSync(p.path)){
            deleteRecursively(p.path);
        }else{
            if(fs.existsSync(p.path)){
                fs.unlinkSync(p.path);
            }

        }

        o.deleted.push(p);
    });
    c.updated.forEach(function(p){
        var targetPath = path.resolve(targetDir, p.relativePath);
        console.log("UPDATED : copying latest from " + p.path + " -> " + targetPath);
        copyFile(p.path, targetPath);
        o.updated.push(p);
    });
    o.changeCount = o.created.length + o.deleted.length + o.updated.length;
    return o;
}

function equalContent(source, target){
    var sStat = fs.statSync(source);
    var tStat = fs.statSync(source);
    if(sStat.isDirectory() !== tStat.isDirectory()){
        return false;
    }
    if(sStat.isDirectory()){
        return showChangesToRepply(source, target).changeCount === 0;
    }else if(sStat.isFile()){
        return checksumFile(source) === checksumFile(target);
    }else{
        throw new Error("undefined; not both dir and not both file : " + source + " <-> " + target);
    }
}

function createSummaryOfChanges(diffMeta, includeUnchanged){
    var all = [];
    diffMeta.addedTopLevel.forEach(function(c){
        all.push({
            path: c,
            status : "+",
            code : diffStates.CODE_ADDED
        })
    });
    diffMeta.deletedTopLevel.forEach(function(c){
        all.push({
            path: c,
            status : "-",
            code : diffStates.CODE_DELETED
        })
    });
    diffMeta.updated.forEach(function(c){
        all.push({
            path: c,
            status : "~",
            code : diffStates.CODE_UPDATED
        })
    });
    if(includeUnchanged){
        diffMeta.unchanged.forEach(function(c){
            all.push({
                path: c,
                status : "=",
                code : diffStates.CODE_SAME
            })
        });
    }

    all.sort(function(a, b){
        return sortPathFn(a.path.path, b.path.path);
    });
    return all;
}

function logDiffSummary(diffMeta){
    var summary = createSummaryOfChanges(diffMeta);

    summary.forEach(function(sp){
        var dirCounts = "";
        var refPath = sp.path.path + "/";
        if(sp.path.dir){
            var childCount = diffMeta.status.filter(function(osp){

                return osp.path.path.indexOf(refPath) === 0;
            }).length;
            dirCounts = " (" + childCount + " children)";
        }
        console.log(sp.status + (sp.path.dir ? "d " : "f ") + sp.path.relativePath + dirCounts);
    });
    console.log("Total changed=" + diffMeta.changeCount + " unchanged=" + diffMeta.unchanged.length);
    if(diffMeta.unreadablePaths.length > 0){
        console.warn("Could not read " + diffMeta.unreadablePaths.length + " paths");
    }
    return summary;
}

module.exports = {
    copyUpdated:copyUpdated,
    deleteRecursively:deleteRecursively,
    mkdirsSync:mkdirsSync,
    listDirChildrenFullPathsRecursively:listDirChildrenFullPathsRecursively,
    listDirChildrenFullPathsRecursivelyFull:listDirChildrenFullPathsRecursivelyFull,
    showChangesToApply:showChangesToRepply,
    showChangesToApplyFlat:showChangesToRepplyFlat,
    reapplyChangesToDir:reapplyChangesToDir,
    equalContent:equalContent,
    diffStates:diffStates,
    createSummaryOfChanges:createSummaryOfChanges,
    logDiffSummary:logDiffSummary
};