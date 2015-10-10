#!/usr/bin/env node
/*
 * Copyright 2015 Jonathan Bosmans <jbosmans@gmail.com>
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
var fsops = require("./fsops");
var path = require("path");

function run(){
    var cwd = process.cwd();
    var args = process.argv;
    var nodePath = args.shift();
    var jsPath= args.shift();

    if(args.length < 2) {
        console.error("Usage: fsopen diff|merge|list sourcePath targetPath");
        process.exit(1);
    }else{
        var ops = {
            diff: function(firstPathArg, secondPathArg, ignorePaths){
                return fsops.showChangesToReapply(firstPathArg, secondPathArg, ignorePaths);
            },
            merge: function(firstPathArg, secondPathArg,ignorePaths){
                return fsops.reapplyChangesToDir(firstPathArg, secondPathArg,ignorePaths);
            },
            list: function(firstPathArg){
                var listed = fsops.listRecursively(firstPathArg);
                console.log(listed.join('\n'));
                process.exit(0);
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
        if(commandArg === 'list'){
            ops[commandArg](firstPathArg);
            return;
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
