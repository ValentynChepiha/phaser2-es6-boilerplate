const del = require("del");
const gulp = require("gulp");
const path = require("path");
const { argv } = require("yargs");
const ansicolor = require("ansi-colors");
const source = require("vinyl-source-stream");
const buffer = require("gulp-buffer");
const uglify = require("gulp-uglify");
const gulpif = require("gulp-if");
const exorcist = require("exorcist");
const babelify = require("babelify");
const browserify = require("browserify");
const browserSync = require("browser-sync");

/**
 * Using different folders/file names? Change these constants:
 */
const PHASER_PATH = './node_modules/phaser/build/';
const BUILD_PATH = './build';
const SCRIPTS_PATH = BUILD_PATH + '/scripts';
const SOURCE_PATH = './src';
const STATIC_PATH = './static';
const ENTRY_FILE = SOURCE_PATH + '/index.js';
const OUTPUT_FILE = 'game.js';

let keepFiles = false;


/**
 * Simple way to check for development/production mode.
 */
function isProduction() {
  return argv.production;
}

/**
 * Logs the current build mode on the console.
 */
function logBuildMode() {
  if (isProduction()) {
    console.log(ansicolor.green('Running production build...'));
  } else {
    console.log(ansicolor.yellow('Running development build...'));
  }
}

/**
 * Deletes all content inside the './build' folder.
 * If 'keepFiles' is true, no files will be deleted. This is a dirty workaround since we can't have
 * optional task dependencies :(
 * Note: keepFiles is set to true by gulp.watch (see serve()) and reseted here to avoid conflicts.
 */
function cleanBuild(cb) {
  if (!keepFiles) {
    del(['build/**/*.*']);
  } else {
    keepFiles = false;
  }
  cb();
}

/**
 * Copies the content of the './static' folder into the '/build' folder.
 * Check out README.md for more info on the '/static' folder.
 */
function copyStatic() {
  return gulp.src(STATIC_PATH + '/**/*')
    .pipe(gulp.dest(BUILD_PATH));
}

/**
 * Copies required Phaser files from the './node_modules/Phaser' folder into the './build/scripts' folder.
 * This way you can call 'npm update', get the lastest Phaser version and use it on your project with ease.
 */
function copyPhaser() {

  let srcList = ['phaser.min.js'];

  if (!isProduction()) {
    srcList.push('phaser.map', 'phaser.js');
  }

  srcList = srcList.map(function(file) {
    return PHASER_PATH + file;
  });

  return gulp.src(srcList)
    .pipe(gulp.dest(SCRIPTS_PATH));
}

/**
 * Transforms ES2015 code into ES5 code.
 * Optionally: Creates a sourcemap file 'game.js.map' for debugging.
 *
 * In order to avoid copying Phaser and Static files on each build,
 * I've abstracted the build logic into a separate function. This way
 * two different tasks (build and fastBuild) can use the same logic
 * but have different task dependencies.
 */
function buildProject() {

  let sourcemapPath = SCRIPTS_PATH + '/' + OUTPUT_FILE + '.map';
  logBuildMode();

  return browserify({
    paths: [path.join(__dirname, 'src')],
    entries: ENTRY_FILE,
    debug: true,
    transform: [
      [
        babelify, {
        presets: ["@babel/preset-env"]
        // presets: ["es2015"]
      }
      ]
    ]
  })
    .transform(babelify)
    .bundle().on('error', function(error) {
      console.log(ansicolor.red(`[Build Error] ${error.message}`));
      this.emit('end');
    })
    .pipe(gulpif(!isProduction(), exorcist(sourcemapPath)))
    .pipe(source(OUTPUT_FILE))
    .pipe(buffer())
    .pipe(gulpif(isProduction(), uglify()))
    .pipe(gulp.dest(SCRIPTS_PATH));

}

/**
 * Starts the Browsersync server.
 * Watches for file changes in the 'src' folder.
 */
function serverSync() {

  let options = {
    server: {
      baseDir: BUILD_PATH
    },
    open: false // Change it to true if you wish to allow Browsersync to open a browser window.
  };

  browserSync(options);

  // Watches for changes in files inside the './src' folder.
  gulp.watch(SOURCE_PATH + '/**/*.js', watchJs);

  // Watches for changes in files inside the './static' folder. Also sets 'keepFiles' to true (see cleanBuild()).
  gulp.watch(STATIC_PATH + '/**/*', watchStatic).on('change', function() {
    keepFiles = true;
  });

}

/**
 * The tasks are executed in the following order:
 * 'cleanBuild' -> 'copyStatic' -> 'copyPhaser' -> 'build' -> 'serve'
 *
 * Read more about task dependencies in Gulp:
 * https://medium.com/@dave_lunny/task-dependencies-in-gulp-b885c1ab48f0
 */
const buildStatic = gulp.series(cleanBuild, copyStatic, copyPhaser);
const build = gulp.series(buildStatic, buildProject);
const watchJs = gulp.series(build, browserSync.reload); // Rebuilds and reloads the project when executed.
const watchStatic = gulp.series(buildStatic, browserSync.reload);

exports.default = gulp.series(build, serverSync);
