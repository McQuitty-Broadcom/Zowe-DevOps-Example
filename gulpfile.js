var gulp = require('gulp-help')(require('gulp'));
var gulpSequence = require('gulp-sequence');
var PluginError = require('plugin-error');
var cmd = require('node-cmd');
var config = require('./config.json');

/**
 * await Job Callback
 * @callback awaitJobCallback
 * @param {Error} err 
 */

/**
* Polls jobId. Callback is made without error if Job completes with CC < MaxRC in the allotted time
* @param {string}           jobId     jobId to check the completion of
* @param {number}           [maxRC=0] maximum allowable return code
* @param {awaitJobCallback} callback  function to call after completion
* @param {number}           tries     max attempts to check the completion of the job
* @param {number}           wait      wait time in ms between each check
*/
function awaitJobCompletion(jobId, maxRC=0, callback, tries = 30, wait = 1000) {
  if (tries > 0) {
      sleep(wait);
      cmd.get(
      'zowe jobs view job-status-by-jobid ' + jobId + ' --rff retcode --rft string',
      function (err, data, stderr) {
          retcode = data.trim();
          //retcode should either be null of in the form CC nnnn where nnnn is the return code
          if (retcode == "null") {
            awaitJobCompletion(jobId, maxRC, callback, tries - 1, wait);
          } else if (retcode.split(" ")[1] <= maxRC) {
            callback(null);
          } else {
            callback(new Error(jobId + " had a return code of " + retcode + " exceeding maximum allowable return code of " + maxRC));
          }
      }
      );
  } else {
      callback(new Error(jobId + " timed out."));
  }
}

/**
* Runs command and calls back without error if successful
* @param {string}           command   command to run
* @param {awaitJobCallback} callback  function to call after completion
*/
function simpleCommand(command, callback){
  cmd.get(command, function(err, data, stderr) { 
    if(err){
      callback(err);
    } else if (stderr){
      callback(new Error("\nCommand:\n" + command + "\n" + stderr + "Stack Trace:"));
    } else {
      callback();
    }
  });
}

/**
* Submits job and verifies successful completion
* @param {string}           ds        data-set to submit
* @param {number}           [maxRC=0] maximum allowable return code
* @param {awaitJobCallback} callback  function to call after completion
*/
function submitJob(ds, maxRC=0, callback){
  var command = 'zowe jobs submit data-set "' + ds + '" --rff jobid --rft string'
  cmd.get(command, function(err, data, stderr) { 
    if(err){
      callback(err);
    } else if (stderr){
      callback(new Error("\nCommand:\n" + command + "\n" + stderr + "Stack Trace:"));
    } else {
      // Strip unwanted whitespace/newline
      var jobId = data.trim();
      
      // Await the jobs completion
      awaitJobCompletion(jobId, maxRC, function(err){
        if(err){
          callback(err);
        } else{
          callback();
        }
      });
    }
   });
}

/**
 * Sleep function.
 * @param {number} ms Number of ms to sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

gulp.task('bind-n-grant', 'Bind & Grant Job', function (callback) {
  var ds = config.bindGrantJCL;
  submitJob(ds, 4, callback);
});

gulp.task('build-cobol', 'Build COBOL element', function (callback) {
  var command = "zowe endevor generate element " + config.testElement + " --type COBOL --override-signout --maxrc 0 --stage-number 1";

  simpleCommand(command, callback);
});

gulp.task('build-lnk', 'Build LNK element', function (callback) {
  var command = "zowe endevor generate element " + config.testElement + " --type LNK --override-signout --maxrc 0 --stage-number 1";

  simpleCommand(command, callback);
});

gulp.task('build', 'Build Program', gulpSequence('build-cobol','build-lnk'));

gulp.task('cics-refresh', 'Refresh(new-copy) ' + config.cicsProgram + ' CICS Program', function (callback) {
  var command = 'zowe cics refresh program "' + config.cicsProgram + '"';

  simpleCommand(command, callback);
});

gulp.task('copy-dbrm', 'Copy DBRMLIB to test environment', function (callback) {
  var command = 'zowe file-master-plus copy data-set "' + config.devDBRMLIB + '" "' + config.testDBRMLIB + '" -m ' + config.testElement;

  simpleCommand(command, callback);
});

gulp.task('copy-load', 'Copy LOADLIB to test environment', function (callback) {
  var command = 'zowe file-master-plus copy data-set "' + config.devLOADLIB + '" "' + config.testLOADLIB + '" -m ' + config.testElement;

  simpleCommand(command, callback);
});

gulp.task('deploy', 'Deploy Program', gulpSequence('copy-dbrm','copy-load','bind-n-grant','cics-refresh'));