var fsops = require("../lib/fsops");
var path = require("path");
var fs = require("fs");
var filesDir = path.resolve(path.dirname(__filename) , "files");
var listDir = path.resolve(filesDir, "listDir");
/*
 copy:copyUpdated,
 deleteRecursively:deleteRecursively,
 mkdirsSync:mkdirsSync,
 listDirChildrenFullPathsRecursively:listDirChildrenFullPathsRecursively,
 listDirChildrenFullPathsRecursivelyFull:listDirChildrenFullPathsRecursivelyFull,
 ensureParentDirExists:ensureParentDirExists
 */

describe("fsops", function(){

    it("can list recursively", function(){
        var children = fsops.listDirChildrenFullPathsRecursivelyFull(listDir);
        expect(children.length).toBe(3);
        expect(path.basename(children[0].path)).toBe("file1.txt");
        function nonExistingSourceDir(){
            fsops.listDirChildrenFullPathsRecursivelyFull("/xyz_nonExisting")
        }
        expect(nonExistingSourceDir).toThrow();
    });
    it("can ignore relative, absolute and wildcard names", function(){
        var children = fsops.listDirChildrenFullPathsRecursivelyFull(listDir);
        expect(children.length).toBe(3);
        children = fsops.listDirChildrenFullPathsRecursivelyFull(listDir, "nested");
        expect(children.length).toBe(1);
        children = fsops.listDirChildrenFullPathsRecursivelyFull(listDir, "nested/file2.txt");
        expect(children.length).toBe(2);
        children = fsops.listDirChildrenFullPathsRecursivelyFull(listDir, ["nested/file2.txt"]);
        expect(children.length).toBe(2);
        children = fsops.listDirChildrenFullPathsRecursivelyFull(listDir, "*.txt");
        expect(children.length).toBe(1);
    });

    it('can create nested directories', function(){
        var newPath = filesDir + path.sep + "a" + path.sep + "b" + path.sep + "c";
        expect(fs.existsSync(newPath)).toBe(false);
        fsops.mkdirsSync(newPath);
        expect(fs.statSync(newPath).isDirectory()).toBe(true);
        fs.rmdirSync(filesDir + path.sep + "a" + path.sep + "b" + path.sep + "c");
        fs.rmdirSync(filesDir + path.sep + "a" + path.sep + "b" );
        fs.rmdirSync(filesDir + path.sep + "a");
    });
    it("can copy recursively", function(){
        var copyDirPath = path.resolve(filesDir, "listDirCopy");
        fsops.copyUpdated(listDir, copyDirPath);
        expect(fs.statSync(copyDirPath).isDirectory()).toBe(true);

        var file1Path = path.resolve(copyDirPath, "file1.txt");
        fs.unlinkSync(file1Path);
        var nestedDirPath = path.resolve(copyDirPath, "nested");
        var file2Path = path.resolve(nestedDirPath, "file2.txt");
        expect(fs.readFileSync(file2Path).toString()).toBe('file2');
        fs.unlinkSync(file2Path);

        fs.rmdirSync(nestedDirPath);
        fs.rmdirSync(copyDirPath);
    });
    it("can delete recursively", function(){
        var copyDirPath = path.resolve(filesDir, "listDirCopy");
        fsops.copyUpdated(listDir, copyDirPath);
        expect(fs.statSync(copyDirPath).isDirectory()).toBe(true);
        expect(fsops.listDirChildrenFullPathsRecursivelyFull(copyDirPath).length).toBe(3);
        fsops.deleteRecursively(copyDirPath);
        expect(fs.existsSync(copyDirPath)).toBe(false);
    });
    it("can list changes made in one directory compared to another to that directory", function(){
        var applyToDir = [filesDir, "applyToDir"].join(path.sep);
        var changedDirPath = [filesDir, "changedDir"].join(path.sep);
        fsops.copyUpdated(listDir, applyToDir);
        expect(fsops.showChangesToApply(listDir, applyToDir).changeCount).toBe(0);
        fsops.copyUpdated(listDir, changedDirPath);
        fs.writeFileSync(path.resolve(changedDirPath, "file3.txt"), "file3");
        fs.writeFileSync([changedDirPath, "nested", "file2.txt"].join(path.sep), "file2mod");
        fs.unlinkSync(path.resolve(changedDirPath, "file1.txt"));
        var o = fsops.showChangesToApply(changedDirPath, applyToDir);
        console.log("changes to apply: ", o);
        expect(o.changeCount >0).toBe(true);
        expect(o.deleted.length).toBe(1);
        expect(o.added.length).toBe(1);
        expect(o.updated.length).toBe(1);
        fsops.deleteRecursively(applyToDir);
        fsops.deleteRecursively(changedDirPath);
    });
    it("can reapply changes made in one directory to another", function(){
        var applyToDir = [filesDir, "applyToDir"].join(path.sep);
        var changedDirPath = [filesDir, "changedDir"].join(path.sep);
        fsops.copyUpdated(listDir, applyToDir);
        fsops.copyUpdated(listDir, changedDirPath);
        var file3Path = path.resolve(changedDirPath, "file3.txt");
        fs.writeFileSync(file3Path, "file3");
        var file2Path = [changedDirPath, "nested", "file2.txt"].join(path.sep);
        fs.writeFileSync(file2Path, "file2mod");
        var deletedFile1Path = path.resolve(changedDirPath, "file1.txt");
        fs.unlinkSync(deletedFile1Path);
        var o = fsops.reapplyChangesToDir(changedDirPath, applyToDir);
        console.log("changes to apply: ", o);
        expect(fs.readFileSync(applyToDir + path.sep + "file3.txt", 'utf8')).toBe("file3");
        expect(fs.readFileSync(applyToDir + path.sep + "nested"+path.sep+ "file2.txt", 'utf8')).toBe("file2mod");
        expect(fs.existsSync(applyToDir + path.sep + "file1.txt")).toBe(false);
        expect(o.changeCount).toBe(3);
        expect(o.deleted.length).toBe(1);
        expect(o.created.length).toBe(1);
        expect(o.updated.length).toBe(1);
        fsops.deleteRecursively(applyToDir);
        fsops.deleteRecursively(changedDirPath);
    });
    it("can tell if dirs have equal content", function(){
        var changedDirPath = [filesDir, "changedDir"].join(path.sep);
        fsops.copyUpdated(listDir, changedDirPath);
        expect(fsops.equalContent(listDir, changedDirPath)).toBe(true);

        var file3Path = path.resolve(changedDirPath, "file3.txt");
        fs.writeFileSync(file3Path, "file3");
        expect(fsops.equalContent(listDir, changedDirPath)).toBe(false);
        fsops.deleteRecursively(changedDirPath);
        fsops.copyUpdated(listDir, changedDirPath);
        var file2Path = [changedDirPath, "nested", "file2.txt"].join(path.sep);
        fs.writeFileSync(file2Path, "file2mod");
        expect(fsops.equalContent(listDir, changedDirPath)).toBe(false);
        fsops.deleteRecursively(changedDirPath);
        fsops.copyUpdated(listDir, changedDirPath);
        var deletedFile1Path = path.resolve(changedDirPath, "file1.txt");
        fs.unlinkSync(deletedFile1Path);
        expect(fsops.equalContent(listDir, changedDirPath)).toBe(false);
        fsops.deleteRecursively(changedDirPath);
    });
    xit("can do a compare of theme sources :)", function(){
        //var source = '/home/spectre/toMergeOct8/source';
        //var target = '/home/spectre/Projects/IBM/DSV/angularTheme';

        //var source = '/tmp/newMerge/theme/angularTheme-static/src/main/webapp/themes/angularTheme';
        //var target = '/home/spectre/Projects/IBM/DSV/angularTheme/angularTheme-static/src/main/webapp/themes/angularTheme';


        var o = fsops.showChangesToApplyFlat(source, target, ["*-xmlaccess*.xml", "*.iml", "*/.idea",".idea",".git", ".project", ".settings", "*/dav/fs-type1"]);
        //delete o.unchanged;
        console.log("WOULD MERGE: ");
        logChanged(o);

        //o.statusChanged.forEach(function(s){
        //    var diff = "diff " + source + path.sep + s.path.relativePath + " " + target + path.sep + s.path.relativePath;
        //
        //        console.log(spaceOut(s.reason, 15) + s.path.relativePath + (s.reason === 'updated' ? (" :: " + diff) : "")) ;
        //
        //
        //});
        //console.log('Changing ' + o.statusChanged.length + " files/dirs");
        //if(false)
        //    fsops.reapplyChangesToDir(source, target, ["*-xmlaccess*.xml", "*.iml", ".idea",".git", ".project", ".settings"]);

    });
    function logChanged(output){
        output.statusChanged.forEach(function(s){
            var diff = "diff " + output.changedDir + path.sep + s.path.relativePath + " " + output.applyToDir + path.sep + s.path.relativePath;
            console.log(spaceOut(s.reason, 15) + s.path.relativePath + (s.reason === 'updated' ? (" :: " + diff) : "")) ;
        });
        console.log('Found ' + output.statusChanged.length + " changes to files/dirs");
    }

    function spaceOut(str, length){
        var s= str;
        while(s.length < length){
            s+= ' ';
        }
        return s;
    }

    fit("can properly ignore non readable files, dirs etc", function(){
        var source = '/home/spectre/Projects/IBM/DSV/angularTheme';
        var target = '/mnt/gentoo64/home/spectre/Projects/DSV/angularTheme';

        var o = fsops.showChangesToApply(source, target, [".git", ".idea"]);
        fsops.logDiffSummary(o);
        console.log(o.unreadablePaths.map(function(c){
            return "UNREADABLE "+c.path;
        }))
        //var summary = fsops.createSummaryOfChanges(o);
        //summary.forEach(function(sp){
        //    console.log(sp.status + (sp.path.dir ? "d " : "f ") + sp.path.relativePath);
        //});
        //logChanged(o);
        //console.log("DELETED TOP LEVEL DIRS = ", o.deletedTopLevel.map(function(c){
        //    return (c.dir ? "d " : "f ") + c.path;
        //}));
        //console.log("all deleted = " + o.deleted.length  + "  vs  top level = " + o.deletedTopLevel.length);
    })


});