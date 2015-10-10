var fsops = require("../lib/fsops");
var path = require("path");
var fs = require("fs");
var filesDir = path.resolve(path.dirname(__filename) , "files");
var listDir = path.resolve(filesDir, "listDir");

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
        fsops.deleteRecursively(filesDir + path.sep + "a");
    });
    it("can copy recursively", function(){
        var copyDirPath = path.resolve(filesDir, "listDirCopy");
        var changeCount = fsops.copyUpdated(listDir, copyDirPath);
        expect(changeCount).toBe(4);
        expect(fs.statSync(copyDirPath).isDirectory()).toBe(true);

        var file1Path = path.resolve(copyDirPath, "file1.txt");
        fs.unlinkSync(file1Path);
        var nestedDirPath = path.resolve(copyDirPath, "nested");
        var file2Path = path.resolve(nestedDirPath, "file2.txt");
        expect(fs.readFileSync(file2Path).toString()).toBe('file2');
        fsops.deleteRecursively(copyDirPath);
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
        var changed = fsops.showChangesToReapply(listDir, applyToDir);
        fsops.logDiffSummary(changed);
        expect(changed.changeCount).toBe(0);
        fsops.copyUpdated(listDir, changedDirPath);
        fs.writeFileSync(path.resolve(changedDirPath, "file3.txt"), "file3");
        fs.writeFileSync([changedDirPath, "nested", "file2.txt"].join(path.sep), "file2mod");
        fs.unlinkSync(path.resolve(changedDirPath, "file1.txt"));
        var o = fsops.showChangesToReapply(changedDirPath, applyToDir);
        console.log("changes to apply: ");
        fsops.logDiffSummary(o);
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
    it("can do a compare of theme sources :)", function(){
        pending("currently depends on dev machine");
        var source = '/home/spectre/Projects/IBM/DSV/angularTheme/angularTheme-static/src/main/webapp/themes/angularTheme';
        var target = '/mnt/gentoo64/home/spectre/Projects/DSV/angularTheme/angularTheme-static/src/main/webapp/themes/angularTheme';
        var o = fsops.showChangesToReapply(source, target, ["*-xmlaccess*.xml", "*.iml", "*/.idea",".idea",".git", ".project", ".settings", "*/dav/fs-type1"]);
        console.log("WOULD MERGE: ");
        fsops.logDiffSummary(o)

    });

    it("can properly ignore non readable files, dirs etc", function(){
        pending("currently depends on dev machine");
        var source = '/home/spectre/Projects/IBM/DSV/angularTheme';
        var target = '/mnt/gentoo64/home/spectre/Projects/DSV/angularTheme';
        var o = fsops.showChangesToReapply(source, target, [".git", ".idea"]);
        fsops.logDiffSummary(o);
    })
});