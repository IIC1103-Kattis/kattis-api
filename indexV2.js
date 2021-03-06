var express = require('express')
var fs = require('fs');
var path = require('path');
var busboy = require('connect-busboy');
var bodyParser = require('body-parser')
var shortid = require('shortid');
var http = require('http');
var querystring = require('querystring');

var app = express();
var port =  process.env.PORT || '3389';

var prefixDir = 'kattis-problemtools/problemtools/';
var suffixDir = '/submissions/accepted/';
var verificationScript = 'verifyproblem.py'

var resultsPath = 'Results/';



app.use(busboy());
app.use(bodyParser());

app.get('/', function (req, res) {
  res.send('Done!')
})

app.listen(port, function () {
  console.log('Example app listening on port '+port+'!')
  console.log('Running on: ' + __dirname + '\n\n');
})

/* TODO: Make Login submission
*/
app.post('/login', function(req, res) {
  console.log('========DIR NAME:');
  console.log('prefixDir: ' + prefixDir);
  console.log('========SENDER:');
  console.log(req.connection.remoteAddress);

  http_request('3000', '1', 'webapi', 'SJnr1hrF-');

  res.send('Logged in!');
})

/* ========= Error Handling ============= */

process.on('uncaughtException', function (err) {
  console.log('Caught exception: ' + err);
});

/* ========= Submissions ============= */

/* Make program submission
*/
app.post('/submit', function(req, res) {
    // console.log(req.headers)
    // console.log(req.connection.remoteAddress)
    // console.log(req.socket.remotePort);

    var fstream ;
    const problemName = req.headers.problem;
    const subID = req.headers.subid;
    const auth_token = req.headers.authorization;
    // var req_port = req.socket.remotePort;
    // var address = req.connection.remoteAddress;

    var req_port = 3000;
    var address = 'webapi';

    if(problemName == null) {
      res.send('No problem specified');
    }

    var problemDir = prefixDir + problemName;
    if(!fs.existsSync(problemDir)) {
      res.send('Can\'t find problem ' + problemName);
    }
    else {
      try {
        req.pipe(req.busboy);
        req.busboy.on('file', function (fieldname, file, filename) {
            // console.log('Uploading: ' + filename);
            res.send('Evaluating...');

            var name = shortid.generate();
            var orig_name = name + '.py';
            var path = prefixDir + problemName + suffixDir
            var problemDir = prefixDir + problemName;
            // console.log(path);
            var subPath = path + name + '.py';
            // console.log('subPath:' + subPath);
            fstream = fs.createWriteStream(subPath);
            file.pipe(fstream);

            fstream.on('close', function () {
              run_program(path, name, problemDir, function ()
              {
                // console.log("bloop")
                http_request(req_port, subID, address, name, auth_token, (name) => {
                  var resultSubPath = resultsPath + name;

                  /* Delete submission and its results */
                  fs.unlink(subPath, (err) => {
                    if (err) throw err;
                    console.log('successfully deleted ' + path + orig_name);
                  });
                  fs.unlink(resultSubPath, (err) => {
                    if (err) throw err;
                    console.log('successfully deleted ' + resultSubPath);
                  });
                });
              });
            });
            // console.log('bleep');
        });
      } catch (e) {
        console.log(e);
        res.send('Error reading file.');
      }
    }
});


/* Make HTTP request to Ruby
*/
function http_request(port, subID, address, problemName, auth_token, callback) {

  /* https://nodejs.org/docs/latest/api/fs.html#fs_fs_watch_filename_options_listener */
  var filename = ''
  let testFolder = './Results'
  // console.log("bloop2")
  fs.watch('./Results', (eventType, filename) => {
    // console.log(`event type is: ${eventType}`);

    if(eventType=='change' && filename) {

      // console.log('Reading ' + filename);

      fs.readFile('./Results/'+filename, 'utf8', function (err,data) {
        if (err) {
          return console.log('READ ERROR:' + err);
        }
        else {
          // console.log('FILE:\n\r'+data);
          process_data(data, (p_data) => {
            console.log(p_data);
            /* Send request */
            var request = require('request');
            request.post({
              headers: {'content-type' : 'application/json', 'Authorization': auth_token },
              url:     'http://webapi:3000/api/v1/online_judge_submissions/'+subID+'/node_result',
              form: p_data
            }, function(error, response, body){
              // console.log("callback")
              callback(filename);
            });
          });
        }
      });

    }
  });
}

function process_data(data, callback) {
  tests = data.split('\n');
  online_judge_submissions = {};
  sub_test_att = {};

  /* Build basic Online Judge Submission values */
  total_sucess = true
  status = 'Done';

  /* Build tests array */
  for (var i = 0; i < tests.length;) {
    if(!tests[i]) {
       tests.splice(i, 1);
    }
    else {
      success = false
      /* Obtain judge result and test name */
      tests[i] = tests[i].replace('test case', '').replace('[', '').replace(']','').split('  ')

      /* Build test's json */
      if (tests[i][0] === 'AC') {
        success = true;
      }
      else {
        total_sucess = false
      }

      sub_test_att[i] = { 'testnumber':i+1, 'result':tests[i][0], 'success':success }
      i++;
    }
  }

  /* Set array of tests insisde corresponding json object */
  online_judge_submissions['submission_tests_attributes'] = sub_test_att;
  online_judge_submissions['status'] = status;
  online_judge_submissions['success'] = total_sucess;


  // console.log({'online_judge_submissions':online_judge_submissions})
  ret = {'online_judge_submission':online_judge_submissions}
  callback(ret);
}

/* Run python program
*/
function run_program(path, script_name, problemName, callback) {
    // console.log(path)
    if (!fs.existsSync(path+'/submissions')) {
      fs.mkdirSync(path+'/submissions');
    }

    const cp = require('child_process');
    // console.log('python ' + prefixDir + verificationScript + ' ' + problemName + ' -s ' + script_name);
    cp.exec('python ' + prefixDir + verificationScript + ' ' + problemName + ' -s ' + script_name);

    // console.log('Finished running script');

    callback();
}

/* ========= Validate Problem ============= */

app.post('/validate', function(req, res) {
  var problemName = req.headers.problem;

  is_program_valid(problemName, function (msg) {
    res.send('response: ' + msg);
  });
});

/*
* TODO: check if problem is valid
  - Has correct name: check
  - Has tests
  - Has folders: check
*/
function is_program_valid(problemName, callback) {

  /* Check if problem exists */
  fs.readdir(prefixDir, function (err, files) {
    if (!err) {
       var path = prefixDir + problemName;
       var msg;
       console.log(path);
       try {
        if (fs.existsSync(path)) {
          msg = 'Problem exists';
          // Check folder structure
          msg += '\n'+ sync_check_folder_structure(path);
          console.log(msg);
        }
        else {
          msg = 'No problem name provided';
        }
      }
      catch (err) {
        //console.log(problemName);
        msg = 'Problem doesnt exist';
      }
    }
    else {
      msg = 'An error ocurred';
    }
    callback(msg);
  })
}

/*
* Check folder structure
*/
function sync_check_folder_structure(problem_path) {
  data_stat = fs.existsSync(problem_path+'/data');
  ifv_stat = fs.existsSync(problem_path+'/input_format_validators');
  ov_stat = fs.existsSync(problem_path+'/output_validators');
  ps_stat = fs.existsSync(problem_path+'/problem_statement');
  subs_stat = fs.existsSync(problem_path+'/submissions');

  sample_data_stat = fs.existsSync(problem_path+'/data/sample');
  secret_data_stat = fs.existsSync(problem_path+'/data/secret');

  acc_subs_stat = fs.existsSync(problem_path+'/submissions');

  status = 'OK!';

  if(data_stat == null || ifv_stat == null || ov_stat == null || ps_stat == null || subs_stat == null) {
    status = 'Main folders missing.'
  }

  if(sample_data_stat == null || secret_data_stat == null) {
    status = 'Data subfolders missing.'
  }

  msg = 'Folder structure:'
      + '\nData: ' + (data_stat) + '\n\tSample: ' + (sample_data_stat) + '\n\tSecret: ' + (secret_data_stat)
      + '\nInputFormatValidator: ' + (ifv_stat)
      + '\nOutputValidator: ' + (ov_stat)
      + '\nProblemStatement: ' + (ps_stat)
      + '\nSubmissions: ' + (subs_stat) + '\n\tAccepted: ' + (acc_subs_stat)
      + '\n\nFolder Structure Status:' + status + '\n';

  var tests_msg_sam = sync_check_tests(problem_path+'/data/sample');
  var tests_msg_sec = sync_check_tests(problem_path+'/data/secret');

  msg += tests_msg_sam;
  msg += tests_msg_sec;

  return msg;
}

/*
* Tests
*/
function sync_check_tests(tests_path) {
  var dict = {};
  /* Obtain tests */
  fs.readdirSync(tests_path).forEach( file => {
    var extension = path.extname(file);
    var name = path.basename(file, extension);
    if(extension === '.in' || extension === '.ans') {
      if(dict[name] === undefined) {
        dict[name] = [];
        dict[name].push(extension);
      }
      else {
        dict[name].push(extension);
      }
    }
  });

  var msg = '\nFolder ' + tests_path + ' has:\n';
  /* Check tests without .in and check tests without .ans */
  for (var key in dict) {
    msg += ' Test ' + key + ':\n';
    if (dict.hasOwnProperty(key)) {

      if(dict[key].includes('.in')) {
        msg += '  Has .in\n';
      }
      else {
        msg += '  WARNING: Has not .in\n';
      }
      if(dict[key].includes('.ans')) {
        msg += '  Has .ans\n';
      }
      else {
        msg += '  WARNING: Has not .ans\n';
      }
    }
  }

  /* Return Info */
  return msg;
}

/*
* TODO: Upload problem.yaml, edit remotely
*/

/*
* TODO: get inputs of problem
*/

/*
* TODO: get answer of problem
*/

/* ========= Testing paths ============= */
app.post('/test', function (req, res) {
  var problemName = 'mult';
  var path_sam = prefixDir + problemName + '/data/sample';
  var path_sec = prefixDir + problemName + '/data/secret';
  sync_check_tests(path_sam);
  sync_check_tests(path_sec);
});
