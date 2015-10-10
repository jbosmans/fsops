#!/usr/bin/env node
var fsops = require("./fsops");
var path = require("path");


function run(){
    var cwd = process.cwd();
    var args = process.argv;
    var nodePath = args.shift();
    var jsPath= args.shift();

    if(args.length < 3) {
        console.error("Usage: fsopen diff|merge sourcePath targetPath");
        process.exit(1);
    }else{
        var ops = {
            diff: function(firstPathArg, secondPathArg, ignorePaths){
                return fsops.showChangesToReapply(firstPathArg, secondPathArg, ignorePaths);
            },
            merge: function(firstPathArg, secondPathArg,ignorePaths){
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

        var out;
        if(args.length > 0){
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
        fsops.logDiffSummary(out, true);
    }
}
try{
    run();
}catch(e){
    console.error("ERROR : ", e);
    console.error(e.stack);
}
