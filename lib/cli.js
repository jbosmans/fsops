#!/usr/bin/env node
var fsops = require("./fsops");
var path = require("path");


function run(){
    var cwd = process.cwd();
    var args = process.argv;
    var nodePath = args.shift();
    var jsPath= args.shift();


    //function spaceOut(str, length){
    //    var s= str;
    //    while(s.length < length){
    //        s+= ' ';
    //    }
    //    return s;
    //}

    if(args.length < 3) {
        console.error("Usage: fsopen diff|merge sourcePath targetPath");
        process.exit(1);
    }else{
        /*
         diff
         merge

         */

        var ops = {
            diff: function(firstPathArg, secondPathArg, ignorePaths){
                return fsops.showChangesToApply(firstPathArg, secondPathArg, ignorePaths);
            },
            merge: function(firstPathArg, secondPathArg,ignorePaths){
                throw new Error();
                return fsops.reapplyChangesToDir(firstPathArg, secondPathArg,ignorePaths);
            }
        };

        var commandArg = args.shift();
        if(!ops.hasOwnProperty(commandArg)){
            console.error("Operation must be one of: " + Object.keys(ops).join(', '));
            process.exit(1);
        }

        var firstPathArg = path.normalize(args.shift());
        if(!path.isAbsolute(firstPathArg)){
            firstPathArg = path.resolve(cwd, firstPathArg);
        }

        var secondPathArg = path.normalize(args.shift());
        if(!path.isAbsolute(secondPathArg)){
            secondPathArg = path.resolve(cwd, secondPathArg);
        }
        //console.log("firstPath=" + firstPathArg);
        //console.log("secondPath=" + secondPathArg);
        var out;
        if(args.length > 0){
            //console.log("options provided, must be ignore");
            if(args.length !== 2 || args.shift() !== '-ignore'){
                throw new Error("Expecting -ignore 'ignoreVals..' ");
            }
            var ignoreVals = args.shift();
            var splitVals  = ignoreVals.split(',');
            out = ops[commandArg](firstPathArg, secondPathArg, splitVals);
            console.log(out)
        }else{
            out = ops[commandArg](firstPathArg, secondPathArg);

        }
        //var source = firstPathArg;
        //var target = secondPathArg;
        fsops.logDiffSummary(out);
        //out.statusChanged.forEach(function(s){
        //    var diff = "diff " + source + path.sep + s.path.relativePath + " " + target + path.sep + s.path.relativePath;
        //    console.log(spaceOut(s.reason, 15) + s.path.relativePath) ;
        //});
        //console.log('' + out.statusChanged.length + " changes total");
    }
}
try{
    run();
}catch(e){
    console.error("ERROR : ", e);
    console.error(e.stack);
}
