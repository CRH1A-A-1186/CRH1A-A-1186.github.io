// 三种模式，与原版一致：普通限时 / 无尽（比 CPS）/ 练习（失误不结束）
var MODE_NORMAL = 1, MODE_ENDLESS = 2, MODE_PRACTICE = 3;
var isDesktop = navigator['userAgent'].match(/(ipad|iphone|ipod|android|windows phone)/i) ? false : true;
var fontunit = isDesktop ? 20 : ((window.innerWidth > window.innerHeight ? window.innerHeight : window.innerWidth) / 320) * 10;
document.write('<style type="text/css">' +
    'html,body {font-size:' + (fontunit < 30 ? fontunit : '30') + 'px;}' +
    (isDesktop ? '#welcome,#GameTimeLayer,#GameLayerBG,#GameScoreLayer.SHADE{position: absolute;}' :
        '#welcome,#GameTimeLayer,#GameLayerBG,#GameScoreLayer.SHADE{position:fixed;}@media screen and (orientation:landscape) {#landscape {display: box; display: -webkit-box; display: -moz-box; display: -ms-flexbox;}}') +
    '</style>');
if (isDesktop) document.write('<div id="gameBody">');
var body, blockSize, GameLayer = [],
    GameLayerBG, touchArea = [],
    GameTimeLayer;
var transform, transitionDuration;

function init() {
    showWelcomeLayer();
    body = document.getElementById('gameBody') || document.body;
    body.style.height = window.innerHeight + 'px';
    transform = typeof (body.style.webkitTransform) != 'undefined' ? 'webkitTransform' : (typeof (body.style.msTransform) !=
        'undefined' ? 'msTransform' : 'transform');
    transitionDuration = transform.replace(/ransform/g, 'ransitionDuration');
    GameTimeLayer = document.getElementById('GameTimeLayer');
    GameLayer.push(document.getElementById('GameLayer1'));
    GameLayer[0].children = GameLayer[0].querySelectorAll('div');
    GameLayer.push(document.getElementById('GameLayer2'));
    GameLayer[1].children = GameLayer[1].querySelectorAll('div');
    GameLayerBG = document.getElementById('GameLayerBG');
    if (GameLayerBG.ontouchstart === null) {
        GameLayerBG.ontouchstart = gameTapEvent;
    } else {
        GameLayerBG.onmousedown = gameTapEvent;
    }
    gameInit();
    var username = cookie("username");
    var message = cookie("message");
    if (username){
        document.getElementById("username").value = username;
    }
    if (message){
        document.getElementById("message").value = message;
    }
    window.addEventListener('resize', refreshSize, false);
    var btn = document.getElementById('ready-btn');
    btn.className = 'btn btn-primary btn-lg';
    btn.onclick = function () {
        closeWelcomeLayer();
    }
    // 模式选择
    mode = getMode();
    var modeLabels = { 1: '普通模式', 2: '无尽模式', 3: '练习模式' };
    document.getElementById('mode').textContent = modeLabels[mode];
    [1, 2, 3].forEach(function (m) {
        var el = document.getElementById('mode-' + m);
        if (el) el.onclick = function () {
            mode = m;
            cookie('gameMode', m, 100);
            document.getElementById('mode').textContent = modeLabels[m];
        };
    });
    // 音效开关
    soundMode = getSoundMode();
    updateSoundBtn();
    var snd = document.getElementById('sound');
    if (snd) snd.onclick = function () {
        soundMode = soundMode === 'on' ? 'off' : 'on';
        cookie('soundMode', soundMode, 100);
        updateSoundBtn();
    };
    // 设置面板：原版的设置入口，这里恢复成可打开
    var sb = document.getElementById('setting-btn');
    if (sb) sb.onclick = show_setting;
    initSetting();
}

function getMode() {
    return cookie('gameMode') ? parseInt(cookie('gameMode')) : MODE_NORMAL;
}
function getSoundMode() {
    return cookie('soundMode') ? cookie('soundMode') : 'on';
}
function updateSoundBtn() {
    var s = document.getElementById('sound');
    if (s) s.textContent = soundMode === 'on' ? '音效: 开' : '音效: 关';
}
// 播放音效，遵守开关
function playSound(id) {
    if (soundMode === 'on') createjs.Sound.play(id);
}
// 读回设置：时长、改键、标题
function initSetting() {
    var t = cookie('gameTime');
    if (t && parseInt(t) > 0) {
        _gameSettingNum = parseInt(t);
        var gt = document.getElementById('gameTime');
        if (gt) gt.value = t;
    }
    var kb = cookie('keyboard');
    if (kb) {
        var k = kb.toString().toLowerCase();
        var el = document.getElementById('keyboard');
        if (el) el.value = k;
        if (k.length >= 4) {
            keyMap = {};
            keyMap[k.charAt(0)] = 1;
            keyMap[k.charAt(1)] = 2;
            keyMap[k.charAt(2)] = 3;
            keyMap[k.charAt(3)] = 4;
        }
    }
    var title = cookie('title');
    if (title) document.title = title;
    gameRestart();
}
var keyMap = { 'd': 1, 'f': 2, 'j': 3, 'k': 4 };
function modeName() {
    return mode === MODE_NORMAL ? '普通模式' : (mode === MODE_ENDLESS ? '无尽模式' : '练习模式');
}

function winOpen() {
    window.open(location.href + '?r=' + Math.random(), 'nWin', 'height=500,width=320,toolbar=no,menubar=no,scrollbars=no');
    var opened = window.open('about:blank', '_self');
    opened.opener = null;
    opened.close();
}
var refreshSizeTime;

function refreshSize() {
    clearTimeout(refreshSizeTime);
    refreshSizeTime = setTimeout(_refreshSize, 200);
}

function _refreshSize() {
    countBlockSize();
    for (var i = 0; i < GameLayer.length; i++) {
        var box = GameLayer[i];
        for (var j = 0; j < box.children.length; j++) {
            var r = box.children[j],
                rstyle = r.style;
            rstyle.left = (j % 4) * blockSize + 'px';
            rstyle.bottom = Math.floor(j / 4) * blockSize + 'px';
            rstyle.width = blockSize + 'px';
            rstyle.height = blockSize + 'px';
        }
    }
    var f, a;
    if (GameLayer[0].y > GameLayer[1].y) {
        f = GameLayer[0];
        a = GameLayer[1];
    } else {
        f = GameLayer[1];
        a = GameLayer[0];
    }
    var y = ((_gameBBListIndex) % 10) * blockSize;
    f.y = y;
    f.style[transform] = 'translate3D(0,' + f.y + 'px,0)';
    a.y = -blockSize * Math.floor(f.children.length / 4) + y;
    a.style[transform] = 'translate3D(0,' + a.y + 'px,0)';
}

function countBlockSize() {
    blockSize = body.offsetWidth / 4;
    body.style.height = window.innerHeight + 'px';
    GameLayerBG.style.height = window.innerHeight + 'px';
    touchArea[0] = window.innerHeight - blockSize * 0;
    touchArea[1] = window.innerHeight - blockSize * 3;
}
var _gameBBList = [],
    _gameBBListIndex = 0,
    _gameOver = false,
    _gameStart = false,
    _gameTime, _gameTimeNum, _gameScore;
var _gameSettingNum = 20;      // 一局时长（秒），可在设置里改
var _gameStartTime = 0;        // 已计时秒数，用于 CPS 的起步判断
var _date1;                    // 开始时刻，用于时间校验
var mode = 1;                  // 当前模式
var soundMode = 'on';          // 音效开关
var welcomeLayerClosed = false;

function gameInit() {
    createjs.Sound.registerSound({
        src: "./static/music/err.mp3",
        id: "err"
    });
    createjs.Sound.registerSound({
        src: "./static/music/end.mp3",
        id: "end"
    });
    createjs.Sound.registerSound({
        src: "./static/music/tap.mp3",
        id: "tap"
    });
    gameRestart();
}

function gameRestart() {
    _gameBBList = [];
    _gameBBListIndex = 0;
    _gameScore = 0;
    _gameOver = false;
    _gameStart = false;
    _gameTimeNum = _gameSettingNum;
    _gameStartTime = 0;
    _gameStartDatetime = 0;
    GameTimeLayer.innerHTML = creatTimeText(_gameTimeNum);
    countBlockSize();
    refreshGameLayer(GameLayer[0]);
    refreshGameLayer(GameLayer[1], 1);
}

function gameStart() {
    _date1 = new Date();
    _gameStartDatetime = _date1.getTime();
    _gameStart = true;
    _gameTime = setInterval(gameTime, 1000);
}
// 每秒点击数，用于无尽模式和评级（原始实现同样如此）
function getCPS() {
    var cps = _gameScore / ((new Date().getTime() - _gameStartDatetime) / 1000);
    if (isNaN(cps) || cps === Infinity || _gameStartTime < 2) cps = 0;
    return cps;
}

function gameOver() {
    if (_gameOver) return;
    _gameOver = true;
    clearInterval(_gameTime);
    playSound("end");
    var cps = getCPS();
    setTimeout(function () {
        GameLayerBG.className = '';
        showGameScoreLayer(cps);
    }, 1500);
}


function encrypt(text){
	var encrypt = new JSEncrypt();
    encrypt.setPublicKey("MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDTzGwX6FVKc7rDiyF3H+jKpBlRCV4jOiJ4JR33qZPVXx8ahW6brdBF9H1vdHBAyO6AeYBumKIyunXP9xzvs1qJdRNhNoVwHCwGDu7TA+U4M7G9FArDG0Y6k4LbS0Ks9zeRBMiWkW53yQlPshhtOxXCuZZOMLqk1vEvTCODYYqX5QIDAQAB");
    var data = encrypt.encrypt(text);
    return data;
  }

function SubmitResults() {
    // 静态托管（GitHub Pages）没有 PHP 后端，排行榜不可用：原版的提交在这里直接跳过
    return;
    var system = "其他操作系统";
    var area = "异世界";
    if (document.getElementById("username").value) {
        if (navigator.appVersion.indexOf("Win") != -1) system = "Windows";
        if (navigator.appVersion.indexOf("Mac") != -1) system = "Macintosh";
        if (navigator.appVersion.indexOf("Linux") != -1) system = "Linux";
        if (navigator.appVersion.indexOf("Android") != -1) system = "Android";
        if (navigator.appVersion.indexOf("like Mac") != -1) system = "iOS";
        if (returnCitySN['cname']) { area = returnCitySN['cname'] };
        var httpRequest = new XMLHttpRequest();
        httpRequest.open('POST', './SubmitResults.php', true);
        httpRequest.setRequestHeader("Content-type", "application/json");
        var name = document.getElementById("username").value;
        var message = document.getElementById("message").value;
		var test="|_|";
        httpRequest.send(encrypt(_gameScore + test + name + test + tj + test + system + test + area + test + message));
    }
}

function gameTime() {
    _gameTimeNum--;
    _gameStartTime++;
    // 只有普通模式会被时间结束；无尽和练习模式一直继续
    if (mode === MODE_NORMAL && _gameTimeNum <= 0) {
        GameTimeLayer.innerHTML = '&nbsp;&nbsp;&nbsp;&nbsp;时间到！';
        gameOver();
        GameLayerBG.className += ' flash';
        playSound("end");
    } else {
        updatePanel();
    }
}
function updatePanel() {
    if (_gameOver) return;
    if (mode === MODE_NORMAL) {
        GameTimeLayer.innerHTML = creatTimeText(_gameTimeNum);
    } else if (mode === MODE_ENDLESS) {
        var cps = getCPS();
        GameTimeLayer.innerHTML = '&nbsp;CPS:' + (cps === 0 ? '计算中' : cps.toFixed(2));
    } else {
        GameTimeLayer.innerHTML = '&nbsp;SCORE:' + _gameScore;
    }
}

function creatTimeText(n) {
    return '&nbsp;TIME:'+n;
}
var _ttreg = / t{1,2}(\d+)/,
    _clearttClsReg = / t{1,2}\d+| bad/;

function refreshGameLayer(box, loop, offset) {
    var i = Math.floor(Math.random() * 1000) % 4 + (loop ? 0 : 4);
    for (var j = 0; j < box.children.length; j++) {
        var r = box.children[j],
            rstyle = r.style;
        rstyle.left = (j % 4) * blockSize + 'px';
        rstyle.bottom = Math.floor(j / 4) * blockSize + 'px';
        rstyle.width = blockSize + 'px';
        rstyle.height = blockSize + 'px';
        r.className = r.className.replace(_clearttClsReg, '');
        if (i == j) {
            _gameBBList.push({
                cell: i % 4,
                id: r.id
            });
            r.className += ' t' + (Math.floor(Math.random() * 1000) % 5 + 1);
            r.notEmpty = true;
            i = (Math.floor(j / 4) + 1) * 4 + Math.floor(Math.random() * 1000) % 4;
        } else {
            r.notEmpty = false;
        }
    }
    if (loop) {
        box.style.webkitTransitionDuration = '0ms';
        box.style.display = 'none';
        box.y = -blockSize * (Math.floor(box.children.length / 4) + (offset || 0)) * loop;
        setTimeout(function () {
            box.style[transform] = 'translate3D(0,' + box.y + 'px,0)';
            setTimeout(function () {
                box.style.display = 'block';
            }, 100);
        }, 200);
    } else {
        box.y = 0;
        box.style[transform] = 'translate3D(0,' + box.y + 'px,0)';
    }
    box.style[transitionDuration] = '150ms';
}

function gameLayerMoveNextRow() {
    for (var i = 0; i < GameLayer.length; i++) {
        var g = GameLayer[i];
        g.y += blockSize;
        if (g.y > blockSize * (Math.floor(g.children.length / 4))) {
            refreshGameLayer(g, 1, -1);
        } else {
            g.style[transform] = 'translate3D(0,' + g.y + 'px,0)';
        }
    }
}

function gameTapEvent(e) {
    if (_gameOver) {
        return false;
    }
    var tar = e.target;
    var y = e.clientY || e.targetTouches[0].clientY,
        x = (e.clientX || e.targetTouches[0].clientX) - body.offsetLeft,
        p = _gameBBList[_gameBBListIndex];
    if (y > touchArea[0] || y < touchArea[1]) {
        return false;
    }
    // 原版的判定顺序：先看点的就是不是目标格子，再看是否落在目标列
    if ((p.id == tar.id && tar.notEmpty) || (p.cell == 0 && x < blockSize) || (p.cell == 1 && x > blockSize && x < 2 *
            blockSize) || (p.cell == 2 && x > 2 * blockSize && x < 3 * blockSize) || (p.cell == 3 && x > 3 * blockSize)) {
        if (!_gameStart) {
            gameStart();
        }
        playSound("tap");
        tar = document.getElementById(p.id);
        tar.className = tar.className.replace(_ttreg, ' tt$1');
        _gameBBListIndex++;
        _gameScore++;
        updatePanel();
        gameLayerMoveNextRow();
    } else if (_gameStart && !tar.notEmpty) {
        // 点错：练习模式只标一下继续，其它模式直接结束
        playSound("err");
        tar.className += ' bad';
        if (mode === MODE_PRACTICE) {
            setTimeout(function () {
                tar.className = tar.className.replace(_clearttClsReg, '');
            }, 500);
        } else {
            gameOver();
        }
    }
    return false;
}

function createGameLayer() {
    var html = '<div id="GameLayerBG">';
    for (var i = 1; i <= 2; i++) {
        var id = 'GameLayer' + i;
        html += '<div id="' + id + '" class="GameLayer">';
        for (var j = 0; j < 10; j++) {
            for (var k = 0; k < 4; k++) {
                html += '<div id="' + id + '-' + (k + j * 4) + '" num="' + (k + j * 4) + '" class="block' + (k ? ' bl' : '') +
                    '"></div>';
            }
        }
        html += '</div>';
    }
    html += '</div>';
    html += '<div id="GameTimeLayer"></div>';
    return html;
}

function closeWelcomeLayer() {
    welcomeLayerClosed = true;
    var l = document.getElementById('welcome');
    l.style.display = 'none';
    updatePanel();
}

function showWelcomeLayer() {
    welcomeLayerClosed = false;
    var l = document.getElementById('welcome');
    l.style.display = 'block';
}

// 这一局的实际耗时没超过 设定时长+3 秒，才算干净的成绩
function legalDeviationTime() {
    return deviation_time < (_gameSettingNum + 3) * 1000;
}

function showGameScoreLayer(cps) {
    var l = document.getElementById('GameScoreLayer');
    var c = document.getElementById(_gameBBList[_gameBBListIndex - 1].id).className.match(_ttreg)[1];
    l.className = l.className.replace(/bgc\d/, 'bgc' + c);
    document.getElementById('GameScoreLayer-text').innerHTML = shareText(cps);
    // 无尽模式看 CPS，其它模式看分数；成绩不干净时标红
    var shown = (mode === MODE_ENDLESS ? cps.toFixed(2) : _gameScore);
    var red = legalDeviationTime() || mode !== MODE_NORMAL ? '' : " style='color:red;'";
    document.getElementById('GameScoreLayer-score').innerHTML =
        (mode === MODE_ENDLESS ? 'CPS&nbsp;&nbsp;' : '得分&nbsp;&nbsp;') + '<span' + red + '>' + shown + '</span>';
    // 练习模式不计入最佳成绩（原版也是如此）
    var bast = cookie('bast-score');
    if (mode !== MODE_PRACTICE && legalDeviationTime()) {
        if (!bast || _gameScore > bast) {
            bast = _gameScore;
            cookie('bast-score', bast, 100);
        }
    }
    document.getElementById('GameScoreLayer-bast').innerHTML = '最佳&nbsp;&nbsp;' + (bast || 0);
    l.style.display = 'block';
}

function hideGameScoreLayer() {
    var l = document.getElementById('GameScoreLayer');
    l.style.display = 'none';
}

function replayBtn() {
    gameRestart();
    hideGameScoreLayer();
}

function backBtn() {
    gameRestart();
    hideGameScoreLayer();
    showWelcomeLayer();
}

// 评语按 CPS 分档（原版也是按 CPS），而不是按总分：这样不同时长的成绩可比
function shareText(cps) {
    var date2 = new Date();
    deviation_time = (date2.getTime() - _date1.getTime());
    if (!legalDeviationTime()) {
        // 倒计时被改过：如实说明多了多少
        return '倒计时多了' + ((deviation_time / 1000) - _gameSettingNum).toFixed(2) + 's';
    }
    if (cps <= 5) return '试着好好练一下？';
    if (cps <= 8) return 'TCL';
    if (cps <= 10) return 'TQL';
    if (cps <= 15) return '您';
    return '人？';
}

function toStr(obj) {
    if (typeof obj == 'object') {
        return JSON.stringify(obj);
    } else {
        return obj;
    }
    return '';
}

function cookie(name, value, time) {
    if (name) {
        if (value) {
            if (time) {
                var date = new Date();
                date.setTime(date.getTime() + 864e5 * time), time = date.toGMTString();
            }
            return document.cookie = name + "=" + escape(toStr(value)) + (time ? "; expires=" + time + (arguments[3] ?
                "; domain=" + arguments[3] + (arguments[4] ? "; path=" + arguments[4] + (arguments[5] ? "; secure" : "") : "") :
                "") : ""), !0;
        }
        return value = document.cookie.match("(?:^|;)\\s*" + name.replace(/([-.*+?^${}()|[\]\/\\])/g, "\\$1") + "=([^;]*)"),
            value = value && "string" == typeof value[1] ? unescape(value[1]) : !1, (/^(\{|\[).+\}|\]$/.test(value) ||
                /^[0-9]+$/g.test(value)) && eval("value=" + value), value;
    }
    var data = {};
    value = document.cookie.replace(/\s/g, "").split(";");
    for (var i = 0; value.length > i; i++) name = value[i].split("="), name[1] && (data[name[0]] = unescape(name[1]));
    return data;
}
document.write(createGameLayer());
// 模式要在第一次 gameRestart 之前读出来（init 里还会再同步一次界面）
mode = getMode();
soundMode = getSoundMode();
var _gameStartDatetime = 0;


function show_btn() {
    document.getElementById("btn_group").style.display = "block"
    document.getElementById("setting").style.display = "none"
}
function show_setting() {
    document.getElementById("btn_group").style.display = "none"
    document.getElementById("setting").style.display = "block"
}
function save_cookie() {
    var settings = ['username', 'message', 'title', 'keyboard', 'gameTime'];
    for (var i = 0; i < settings.length; i++) {
        var el = document.getElementById(settings[i]);
        if (el && el.value) cookie(settings[i], el.value.toString(), 100);
    }
    initSetting();
}
function isnull(val) {
    var str = val.replace(/(^\s*)|(\s*$)/g, '');
    if (str == '' || str == undefined || str == null) {
        return true;
    } else {
        return false;
    }
}
function goRank() {
    var name=document.getElementById("username").value;
    var link='./rank.php';
    if(!isnull(name)){
        link+="?name="+name;
    }
    window.location.href=link;
}

function click(index) {
    if (!welcomeLayerClosed) {
        return;
    }
    let p = _gameBBList[_gameBBListIndex];
    let base = parseInt(document.getElementById(p.id).getAttribute("num")) - p.cell;
    let num = base + index - 1;
    let id = p.id.substring(0, 11) + num;

    let fakeEvent = {
        clientX: ((index - 1) * blockSize + index * blockSize) / 2 + body.offsetLeft,
        // Make sure that it is in the area
        clientY: (touchArea[0] + touchArea[1]) / 2,
        target: document.getElementById(id),
    };

    gameTapEvent(fakeEvent)
}

document.onkeydown = function (e) {
    var key = (e.key || '').toLowerCase();
    if (Object.keys(keyMap).indexOf(key) !== -1) {
        click(keyMap[key]);
    }
};

console.log("不修改，好嘛？乱传又有什么用呢？(ˉ▽ˉ；)...")
