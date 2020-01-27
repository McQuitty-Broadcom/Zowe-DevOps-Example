var cmd = require('node-cmd'),
    config = require('./config.json'),
    fs = require('fs'),
    gulp = require('gulp-help')(require('gulp')),
    gulpSequence = require('gulp-sequence'),
    PluginError = require('plugin-error'),
    readlineSync = require('readline-sync');


/**
 * await Job Callback - Callback is made without error if Job completes with 
 * CC < MaxRC in the allotted time
 * @callback awaitJobCallback
 * @param {Error} err 
 */

/**
  * commandObject - object contains command to submit and directory to download output to
  * @object commandObject
  * @param {string} command Command to submit
  * @param {string} dir     Directory to download command output to 
  */

 /**
* Creates zw (Zowe-Workshop) profiles for project and sets them as default
* @param {string}           host     z/OS host the project is running against
* @param {string}           user     username
* @param {string}           pass     password
* @param {awaitJobCallback} callback function to call after completion
*/
function createAndSetProfiles(host, user, pass, callback){
  var commands = [
    {
      command: "zowe profiles create zosmf zw --host " + host + " --user " + user + " --pass " +
               pass + " --port " + config.zosmfPort + " --ru " + config.zosmfRejectUnauthorized + " --ow",
      dir: "command-archive/create-zosmf-profile"
    },
    {
      command: "zowe profiles set zosmf zw",
      dir: "command-archive/set-zosmf-profile"
    },
    {
      command: "zowe profiles create endevor zw --host " + host + " --user " + user + " --pass " +
               pass + " --port " + config.endevorPort + " --ru " + config.endevorRejectUnauthorized + 
               " --protocol " + config.endevorProtocol + " --ow",
      dir: "command-archive/create-endevor-profile"
    },
    {
      command: "zowe profiles set endevor zw",
      dir: "command-archive/set-endevor-profile"
    },
    {
      command: "zowe profiles create endevor-location zw --instance " + config.endevorInstance +
               " --environment " + config.endevorEnvironment + " --system " + config.endevorSystem +
               " --subsystem " + config.endevorSubsystem + " --ccid " + user + 
               " --maxrc 0 --stage-number 1 --comment " + user + " --ow",
      dir: "command-archive/create-endevor-location-profile"
    },
    {
      command: "zowe profiles set endevor-location zw",
      dir: "command-archive/set-endevor-location-profile"
    },
    {
      command: "zowe profiles create fmp zw --host " + host + " --user " + user + " --pass " +
               pass + " --port " + config.fmpPort + " --ru " + config.fmpRejectUnauthorized + 
               " --protocol " + config.fmpProtocol + " --ow",
      dir: "command-archive/create-fmp-profile"
    },
    {
      command: "zowe profiles set fmp zw",
      dir: "command-archive/set-fmp-profile"
    },
    {
      command: "zowe profiles create cics zw --host " + host + " --user " + user + " --password " +
               pass + " --port " + config.cicsPort + " --region-name " + config.cicsRegion +
               " --protocol " + config.cicsProtocol + " --ow",
      dir: "command-archive/create-cics-profile"
    },
    {
      command: "zowe profiles set cics zw",
      dir: "command-archive/set-cics-profile"
    },
    {
      command: "zowe profiles create db2 zw --host " + host + " --user " + user + " --pass " +
               pass + " --port " + config.db2Port + " --database " + config.db2Database + 
               " --ow",
      dir: "command-archive/create-db2-profile"
    },
    {
      command: "zowe profiles set db2 zw",
      dir: "command-archive/set-db2-profile"
    }
  ];
  submitMultipleSimpleCommands(commands, callback);
}

/**
* Runs command and calls back without error if successful
* @param {string}           command           command to run
* @param {string}           dir               directory to log output to
* @param {awaitJobCallback} callback          function to call after completion
* @param {Array}            [expectedOutputs] array of expected strings to be in the output
*/
function simpleCommand(command, dir, callback, expectedOutputs){
  cmd.get(command, function(err, data, stderr) { 
    //log output
    var content = "Error:\n" + err + "\n" + "StdErr:\n" + stderr + "\n" + "Data:\n" + data;
    writeToFile(dir, content);
    
    if(err){
      callback(err);
    } else if (stderr){
      callback(new Error("\nCommand:\n" + command + "\n" + stderr + "Stack Trace:"));
    } else if(typeof expectedOutputs !== 'undefined'){
      verifyOutput(data, expectedOutputs, callback);
    } else {
      callback();
    }
  });
}

/**
* Submits job, verifies successful completion, stores output
* @param {string}           ds                  data-set to submit
* @param {string}           [dir="job-archive"] local directory to download spool to
* @param {number}           [maxRC=0]           maximum allowable return code
* @param {awaitJobCallback} callback            function to call after completion
*/
function submitJobAndDownloadOutput(ds, dir="job-archive", maxRC=0, callback){
  var command = 'zowe jobs submit data-set "' + ds + '" -d ' + dir + " --rfj";
  cmd.get(command, function(err, data, stderr) { 
    //log output
    var content = "Error:\n" + err + "\n" + "StdErr:\n" + stderr + "\n" + "Data:\n" + data;
    writeToFile("command-archive/job-submission", content);

    if(err){
      callback(err);
    } else if (stderr){
      callback(new Error("\nCommand:\n" + command + "\n" + stderr + "Stack Trace:"));
    } else {
      data = JSON.parse(data).data;
      retcode = data.retcode;

      //retcode should be in the form CC nnnn where nnnn is the return code
      if (retcode.split(" ")[1] <= maxRC) {
        callback(null);
      } else {
        callback(new Error("Job did not complete successfully. Additional diagnostics:" + JSON.stringify(data,null,1)));
      }
    }
  });
}

/**
* Submits multiple simple commands
* @param {commandObject[]}  commands Array of commandObjects
* @param {awaitJobCallback} callback function to call after completion
*/
function submitMultipleSimpleCommands(commands, callback){
  if(commands.length>0){
    simpleCommand(commands[0].command, commands[0].dir, function(err){
      if(err){
        callback(err);
      } else {
        commands.shift();
        submitMultipleSimpleCommands(commands, callback);
      }
    })
  } else {
    callback();
  }
}

/**
* Runs command and calls back without error if successful
* @param {string}           data            command to run
* @param {Array}            expectedOutputs array of expected strings to be in the output
* @param {awaitJobCallback} callback        function to call after completion
*/
function verifyOutput(data, expectedOutputs, callback){
  expectedOutputs.forEach(function(output){
    if (!data.includes(output)) {
      callback(new Error(output + " not found in response: " + data));
    }
  });
  // Success
  callback();
}

/**
* Writes content to files
* @param {string}           dir     directory to write content to
* @param {string}           content content to write
*/
function writeToFile(dir, content) {
  var d = new Date(),
      filePath = dir + "/" + d.toISOString() + ".txt";

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  };
  
  fs.writeFileSync(filePath, content, function(err) {
    if(err) {
      return console.log(err);
    }
  });
}

gulp.task('bind-n-grant', 'Bind & Grant Job', function (callback) {
  var ds = config.bindGrantJCL;
  submitJobAndDownloadOutput(ds, "job-archive/bind-n-grant", 4, callback);
});

gulp.task('build-cobol', 'Build COBOL element', function (callback) {
  var command = "zowe endevor generate element " + config.testElement + " --type COBOL --override-signout --maxrc 0 --stage-number 1";

  simpleCommand(command, "command-archive/build-cobol", callback);
});

gulp.task('cics-refresh', 'Refresh(new-copy) ' + config.cicsProgram + ' CICS Program', function (callback) {
  var command = 'zowe cics refresh program "' + config.cicsProgram + '"';

  simpleCommand(command, "command-archive/cics-refresh", callback);
});

gulp.task('copy-dbrm', 'Copy DBRMLIB to test environment', function (callback) {
  var command = 'zowe file-master-plus copy data-set "' + config.devDBRMLIB + '" "' + config.testDBRMLIB + '" -m ' + config.testElement;

  simpleCommand(command, "command-archive/copy-dbrm", callback);
});

gulp.task('copy-load', 'Copy LOADLIB to test environment', function (callback) {
  var command = 'zowe file-master-plus copy data-set "' + config.devLOADLIB + '" "' + config.testLOADLIB + '" -m ' + config.testElement;

  simpleCommand(command, "command-archive/copy-load", callback);
});

gulp.task('deploy', 'Deploy Program', gulpSequence('copy-dbrm','copy-load','bind-n-grant','cics-refresh'));

gulp.task('setupProfiles', 'Create project profiles and set them as default', function (callback) {
  var host, user, pass;
  host = readlineSync.question('Host name or IP address: ');
  user = readlineSync.question('Username: ');
  pass = readlineSync.question('Password: ', { hideEchoBack: true });
  createAndSetProfiles(host, user, pass, callback);
});
