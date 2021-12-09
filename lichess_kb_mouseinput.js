// ==UserScript==
// @name     Lichess kb+mouseinput
// @version  1
// @grant    none
// @run-at document-idle
// @include /^https://lichess\.org/([a-zA-Z0-9]+(/(white|black).*)?$|analysis|training)
// ==/UserScript==

(function() {
'use strict';

// Options
var forceClickmove = true;  // Click vs. drag move; both work, but click move works better.
var dropImmediately = true; // In zh, drop the piece vs. put it in your hand.
var pseudoDrag = false;     // When there are multiple matching pieces, put the piece in your hand vs. just select it.
var multipremove = false;   // EXPERIMENTAL!
var multiWithoutShift = true; // When this is true, you don't have to hold Shift when making multipremoves
var useMutationObserver = true; // Whether to use a MutationObserver to detect changes to the board and react instantly or simply set a timeout to to see if the board has changed.
// dropImmediately=false and pseudoDrag=true are hacky and potentially dangerous to use:
// If your next click anywhere on the page is a left click within the board's borders (even if there's something else above the board),
// it WILL complete the move (even if the piece has disappeared from the cursor for any other reason, like navigating the move list with the arrow keys).


// Mouse position in client coordinates
var cx = -1;
var cy = -1;


document.addEventListener("mousemove",function(e) {
    cx = e.clientX;
    cy = e.clientY;
});

document.addEventListener("mouseenter",function(e) {
    cx = e.clientX;
    cy = e.clientY;
});

window.setTimeout(function() {
    var dragging = false;
    var dragEl = null;
    var hasDragged = 0;
    var dragFromX = -1;
    var dragFromY = -1;
    var board, bparent, x0, y0, w, sqsize;
    var premoveStack = [];
    var curpremove = 0;
    var turn = "";
    var mycolor = "";

    var premoving = false;

    function find_board() {
        board = $(".cg-board")[0];
        bparent = $(".cg-board-wrap")[0];
        var rect = board.getBoundingClientRect();
        x0 = rect.left;
        y0 = rect.top;
        w = rect.width;
        sqsize = w / 8;
    }

    find_board();
    mycolor = get_color();

    function premove_exists() {
        return !!$(".current-premove").length;
    }

    function getTurn() {
        var fen_els = $("input.copyable");
        if (fen_els.length > 0)
            return fen_els[0].value.split(" ")[1] === "w" ? "white" : "black";
        var moves = $("div.replay div.moves move");
        if (!moves.length) return "white";
        return moves[moves.length-1].innerText === "" ? "black" : "white";
    }

    function changeTurn(color) {
    }

    var wclock, bclock;
    wclock = $("div.clock_white");
    wclock = wclock.length ? wclock[0] : null;
    /*function premoveObserver(m) {
        if (!premove_exists()) makePremoves();
    }
    let config = { childList: true };
    let m =  new MutationObserver(premoveObserver);
    m.observe(board,config);*/
    function turnObserver(m) {
        var newTurn;
        var moves = $("div.replay div.moves move");
        var plies = moves.length;
        if (!plies) {
            newTurn = "white";
            return;
        }
        else {
            plies = moves.length;
            if (moves[plies-1].innerText === "")
                plies--;
            newTurn = plies % 2 ? "black" : "white";
        }
        if (newTurn == get_color()) {
            window.setTimeout(function(){
                if (premove_exists()) {
                    var o;
                    var observe = function(m) {
                        if (!premove_exists()) {
                            o.disconnect();
                            makePremoves();
                        }
                    };
                    var config = {childList: true};
                    if (useMutationObserver) {
                        o = new MutationObserver(observe);
                        o.observe(board,config);
                    } else window.setTimeout(makePremoves,30);
                } else
                    makePremoves();
            }, 10);
        }
        //console.log(moves[plies-1].innerText,newTurn);
    }
    var notation = $("div.replay div.moves");
    if (notation.length) {
        notation = notation[0];
        let config = { childList: true };
        let m =  new MutationObserver(turnObserver);
        m.observe(notation,config);
    }

    // For use with pseudoDrag (and zh drops with dropImmediately == false)
    function clickListener(e) {
        document.removeEventListener("mousedown",clickListener);
        if (e.button == 0) {
            if (dragFromX !== -1)
                clickAt(dragFromX,dragFromY,dragEl);
            clickAt(e.clientX,e.clientY,dragEl);
            dragEl = null;
        }
    }

    function cancelPremoves(alsoNormalPremoves=false) {
        console.log("Cancelling premoves");
        var s = premoveStack;
        premoveStack = [];
        if (alsoNormalPremoves && $(".current-premove").length) {
            console.log("Cancelling current premove");
            find_board();
            clickAt(x0+5,y0+5);
            clickAt(x0+5,y0+5);
        }
        for (var i = curpremove; i < s.length; ++i) {
            var arrow = s[i][s[i].length-1];
            if (arrow && svg.contains(arrow))
                svg.removeChild(arrow);
        }
        curpremove = 0;
    }

    function premoveCanceler(e) {
        if (e.screenX || e.screenY) {
            console.log(e);
            cancelPremoves();
        }
    }

    if (multipremove) {
        board.addEventListener("mousedown",premoveCanceler);
    }

    function clickAt(x,y,el=board) {
        clickDown(x,y,el);
        clickUp(x,y,el);
        //console.log(x,y);
    }

    function clickUp(x,y,el=board) {
        var ev = new MouseEvent("mouseup", {
            "view": window,
            "bubbles": true,
            "cancelable": false,
            "clientX": x,
            "clientY": y
        });
        el.dispatchEvent(ev);
        //console.log(x,y);
    }

    function clickDown(x,y,el=board) {
        var ev = new MouseEvent("mousedown", {
            "view": window,
            "bubbles": true,
            "cancelable": false,
            "clientX": x,
            "clientY": y,
        });
        el.dispatchEvent(ev);
    }

    function mouseMove(x,y,el=board) {
        var ev = new MouseEvent("mousemove", {
            "view": window,
            "bubbles": true,
            "cancelable": false,
            "clientX": x,
            "clientY": y
        });
        el.dispatchEvent(ev);
    }

    function makePremoves(recursiveCall=false,lastFrom="",lastX=0,lastY=0) {
        if (premoving && !recursiveCall) return;
        premoving = true;
        if (curpremove >= premoveStack.length) {
            if (lastFrom)
                clickAt(lastX,lastY);
            premoveStack = [];
            curpremove = 0;
            premoving = false;
            return;
        }
        var [x,y,tx,ty,from,to,arrow] = premoveStack[curpremove++];
        if (lastFrom && lastFrom != from )
            clickAt(lastX,lastY);
        if (arrow && svg.contains(arrow))
            svg.removeChild(arrow);
        var config = { childList: true};
        var observer;
        var pieces = $("piece." + get_color());
        var found = false;
        for (var piece of pieces) {
            if (piece.cgKey == from) {
                found = true;
                break;
            }
        }
        console.log("consider " + from+to);
        if (!found) {
            console.log("No such piece on " + from);
            makePremoves(true);
            return;
        }
        function observe() {
            if (useMutationObserver)
                observer.disconnect();
            var selected = $("square.selected");
            var squares = $("square.premove-dest,square.move-dest");
            console.log($.makeArray(squares).map(f => f.cgKey));
            for (var sq of squares) {
                if (sq.cgKey == to) {
                    var is_premove = sq.className.includes("premove-dest");
                    console.log("play " + from + to);
                    clickAt(tx,ty);
                    if (!is_premove)
                        makePremoves(true);
                    else
                        premoving = false;
                    return;
                }
            }
            console.log("cancel " + from + to);
            //clickAt(x,y);
            makePremoves(true,from,x,y);
        }
        if (useMutationObserver) {
            observer = new MutationObserver(observe);
            observer.observe(board,config);
        }
        if (lastFrom != from) {
            console.log("click " + from);
            clickAt(x,y);
        }
        if (!useMutationObserver)
            window.setTimeout(observe,100);
    }

    function clickMove(x,y,tx,ty,el=board) {
        clickAt(x,y,el);
        clickAt(tx,ty,el);
        if (el == board) {
            // An illegal move can result in the to-square being selected.
            // Deselect it if so.
            window.setTimeout(function(){
                var c = board.children;
                for (var i = 0; i < c.length; ++i) {
                    if (c[i].className.includes("selected")) {
                        clickAt(tx,ty,el);
                        return;
                    }
                }
            },0);
        }
        return;
    }

    function drag(x,y,tx,ty,el=board) {
        clickDown(x,y,el);
        mouseMove(tx,ty,el);
        // If we could be sure the last click on the board was a drag move, we could just do
        // clickUp(tx,ty,el);
        // here and it'd work perfectly with no spurious animation.
        // But we can't.
        window.setTimeout(function(){clickUp(tx,ty,el);},0);
    }

    function makeMove(x,y,tx,ty,el=board) {
        if (forceClickmove)
            clickMove(x,y,tx,ty,el);
        else
            drag(x,y,tx,ty,el);
    }

    function isFlipped() {
        return bparent.className.includes("orientation-black");
    }

    function tocoord(pos,zero,is_x) {
        if (pos < 0) return -1;
        var flip = (is_x == (bparent.className.includes("orientation-black")));
        var c = Math.floor(8 * (pos - zero) / w);
        return flip ? 7 - c : c;
    }

    function to_boardoffset(x,y) {
        if (isFlipped())
            return [(7-x)*sqsize,sqsize*y];
        else
            return [sqsize*x,(7-y)*sqsize];
    }

    function to_sq(x,y) {
        if (x < 0 || x > 7 || y < 0 || y > 7) return "";
        x = String.fromCharCode(97 + x);
        y = '12345678'[y];
        return x + y;
    }

    function from_sq(xy) {
    }

    function get_color() {
        var mycolor = isFlipped() ? "black" : "white";
        var fen_els = $("input.copyable");
        if (fen_els.length > 0)
            mycolor = fen_els[0].value.split(" ")[1] === "w" ? "white" : "black";
        if (wclock) mycolor = wclock.className.includes("clock_bottom") ? "white" : "black";
        // TODO: in puzzles, detect that it's not a game and therefore mycolor = getTurn()
        console.log("mycolor=" + mycolor);
        return mycolor;
    }


    function to_xy(sq) {
        var x = sq.charCodeAt(0) - 'a'.charCodeAt(0);
        var y = sq.charCodeAt(1) - '1'.charCodeAt(0);
        return [x,y];
    }

    var svg = bparent.children[1];
    var defs = svg.children[0];
    defs.innerHTML = '<marker id="arrowhead-g" orient="auto" markerWidth="4"' +
        ' markerHeight="8" refX="2.05" refY="2.01" cgKey="g">' +
        '<path d="M0,0 V4 L3,2 Z" fill="#15781B"></path></marker>';

    function drawArrow(from,to) {
        var [fx,fy] = to_xy(from);
        var [tx,ty] = to_xy(to);
        [fx,fy] = to_boardoffset(fx,fy);
        [tx,ty] = to_boardoffset(tx,ty);
        var offset = sqsize/2;
        fx += offset; fy += offset; tx += offset; ty += offset;
        var xmlns = "http://www.w3.org/2000/svg";
        var line = document.createElementNS(xmlns,"line");
        line.setAttributeNS(null,"x1",fx);
        line.setAttributeNS(null,"y1",fy);
        line.setAttributeNS(null,"x2",tx);
        line.setAttributeNS(null,"y2",ty);
        line.setAttributeNS(null,"stroke-width",10);
        line.setAttributeNS(null,"stroke-linecap","round");
        line.setAttributeNS(null,"marker-end","url(#arrowhead-g)");
        line.setAttributeNS(null,"opacity",1);
        line.setAttributeNS(null,"cgHash",from + to + "green");
        line.setAttributeNS(null,"stroke","#15781B");
        svg.appendChild(line);
        return line;
    }

    function addPremove(cx,cy,tx,ty,from,to) {
        var arrow = drawArrow(from, to);
        premoveStack.push([cx,cy,tx,ty,from,to,arrow]);
    }


    var nmoves = [[2,1],[1,2],[-1,2],[-2,1],
              [2,-1],[1,-2],[-1,-2],[-2,-1]];

    var qmoves = [[1,1],[0,1],[-1,1],
              [1,0],[-1,0],
              [1,-1],[0,-1],[-1,-1]];
    var kmoves = qmoves;
    var rmoves = [[0,1],[1,0],[0,-1],[-1,0]];
    var bmoves = [[1,1],[-1,1],[1,-1],[-1,-1]];
    var pmoves = [[1,1],[0,1],[-1,1]];
    var legaldirs = {
        "queen": qmoves,
        "king": kmoves,
        "rook": rmoves,
        "bishop": bmoves,
        "knight": nmoves,
        "pawn": pmoves
    };

    function is_pseudolegal(fx, fy, tx, ty, pieceat, is_premove) {
        var origty = ty;
        var _piece = pieceat[fx][fy];
        var capture = pieceat[tx][ty];
        var [color, piece] = _piece.split(" ");
        if (false && !is_premove && (capture.includes(color) && (piece != "king" || !capture.includes("rook"))))
            return false;
        if (color == "black") {
            ty = 7 - ty;
            fy = 7 - fy;
        }
        var dx = tx - fx;
        var dy = ty - fy;
        var callback = function(a) { return a[0] == dx && a[1] == dy; };
        if (piece == "pawn") {
            if (pmoves.find(callback))
                return true;
            return fy < 2 && dy == 2 && dx == 0;
        }
        // Castling (including king-captures-rook and Chess960)
        if (piece == "king" && fy == 0 && dy == 0) {
            if (tx == 6 || tx == 2 || capture == color + " rook")
                return true;
        }
        if (piece != "king" && piece != "knight") {
            var div = dx || dy || 1;
            dx /= div;
            dy /= div;
        }
        var ret = legaldirs[piece].find(callback);
        if (!ret) {
            //console.log("Not pseudolegal");
            //console.log(dx,dy);
            //console.log(legaldirs[piece]);
        }
        return ret;
    }

    function trymove(dirs, max_i=7, requirepiece="",addpremove=false) {
        if (multiWithoutShift)
            addpremove = true;
        var pieceat = [
            ["","","","","","","",""],
            ["","","","","","","",""],
            ["","","","","","","",""],
            ["","","","","","","",""],
            ["","","","","","","",""],
            ["","","","","","","",""],
            ["","","","","","","",""],
            ["","","","","","","",""],
        ];
        document.removeEventListener("mousedown",clickListener);
        find_board();
        var turn = getTurn();
        var mycolor = get_color();
        var tx = tocoord(cx,x0,true);
        var ty = tocoord(cy,y0,false);
        if (tx < 0 || ty < 0 || tx > 7 || ty > 7) return;
        var to = to_sq(tx,ty);
        //console.log(to);
        if (dirs[0].constructor !== Array) {
            dirs = [[dirs[0], dirs[1]]];
        }
        var dirmul = isFlipped() ? -1 : 1;
        var c = board.children;

        var selected = "";
        var sel_x = 0, sel_y = 0;
        var has_premove = false;
        var premovesq = "";
        for (var i = 0; i < c.length; ++i) {
            var p = c[i];
            var sq = p.cgKey;
            let [x,y] = to_xy(sq);
            if (p.nodeName == "SQUARE") {
                if (p.className.includes("selected")) {
                    var rect = p.getBoundingClientRect();
                    sel_x = rect.left + 1;
                    sel_y = rect.top + 1;
                    selected = sq;
                }
                if (p.className.includes("current-premove")) {
                    if (sq == to)
                        has_premove = true;
                    else
                        premovesq = sq;
                }

                continue;
            }
            pieceat[x][y] = p.cgPiece;
        }
        var origins = [];
        var found = false;
        var startIndex = 0;
        for (var d = 0; d < dirs.length; ++d) {
            var xdir = dirs[d][0] * dirmul;
            var ydir = dirs[d][1] * dirmul;
            var blocker = false;
            for (i = 1; i <= max_i; ++i) {
                var x = tx - i * xdir;
                var y = ty - i * ydir;
                if (x < 0 || y < 0 || x > 7 || y > 7) break;
                if (pieceat[x][y].includes(mycolor) && (!requirepiece || pieceat[x][y].includes(requirepiece))) {
                    var from = to_sq(x,y);
                    if (!is_pseudolegal(x,y,tx,ty,pieceat,turn!=mycolor)) break;
                    var fx = cx - i * xdir * dirmul * sqsize;
                    var fy = cy + i * ydir * dirmul * sqsize;
                    origins.push([fx,fy,from]);
                    if ((has_premove && premovesq == from) || from == selected) {
                        startIndex = origins.length;
                    }

                    break;
                } else if (pieceat[x][y]) {
                    if (blocker || turn == mycolor || !mycolor) break;
                    blocker = true;
                }
            }
        }

        if (!origins.length) {
            if (selected) {
                clickAt(sel_x,sel_y);
            }
            return;
        } else if (origins.length == 1) {
            if (origins[0][2] === selected && !has_premove) // The right piece is already selected. Just complete the move.
                clickAt(cx,cy);
            else {
                if (selected)
                    clickAt(sel_x,sel_y);
                if (multipremove && addpremove && premovesq) {
                    addPremove(origins[0][0],origins[0][1],cx,cy,origins[0][2],to);
                }
                else {
                    makeMove(origins[0][0],origins[0][1],cx,cy);
                }
            }
            return;
        } else {
            cancelPremoves();
            // There are multiple matching pieces.
            if (selected)
                clickAt(sel_x,sel_y);
            i = startIndex % origins.length;

            if (!pseudoDrag) {
                clickAt(origins[i][0],origins[i][1]);
                return;
            } else {
                dragEl = board;
                clickDown(origins[i][0],origins[i][1]);
                mouseMove(cx,cy);
                dragFromX = origins[i][0];
                dragFromY = origins[i][1];
                document.addEventListener("mousedown",clickListener);
            }
        }
    }

    function Dropmove(piece) {
        var p =  $("div.pocket.usable");
        if (!p.length) return; // Not a crazyhouse game
        piece = p[0].children[piece];
        if (!piece.dataset.nb) return; // Don't have any of the piece in pocket
        if (dropImmediately) {
            clickAt(cx,cy,piece);
        } else {
            dragging = true;
            dragEl = piece;
            clickDown(cx,cy,dragEl);
            document.addEventListener("mousedown",clickListener);
        }
    }

    function bindMove(c,dirs,requirepiece="",max_i=7) {
        window.Mousetrap.bind(c,function(){trymove(dirs,max_i,requirepiece);});
        window.Mousetrap.bind("shift+"+c,function(){trymove(dirs,max_i,requirepiece,true);});
    }

    function bindDrop(key,piece) {
        window.Mousetrap.bind(key,function(){Dropmove(piece);});
    }

    function setShortcuts() {
        if (multipremove)
            window.Mousetrap.bind("esc",function() {cancelPremoves(true); });
        // Move a specific kind of piece to the square
        bindMove("n",nmoves,"knight",1);
        bindMove("k",kmoves,"king",1);
        // Disabling these by default since I haven't tested them enough.
        // Plus, with Q taken there's no obvious key for queen.
        //bindMove("b",bmoves,"bishop");
        //bindMove("t",qmoves,"queen");
        //bindMove("r",rmoves,"rook");

        // Directions
        bindMove("q",[-1,1]);
        bindMove("w",[0,1]);
        bindMove("e",[1,1]);
        bindMove("a",[-1,0]);
        bindMove("d",[1,0]);
        bindMove("z",[-1,-1]);
        bindMove("x",[0,-1]);
        bindMove("c",[1,-1]);
        bindDrop("1",0);
        bindDrop("2",1);
        bindDrop("3",2);
        bindDrop("4",3);
        bindDrop("5",4);

        // Accidentally flipping the board or starting a search can be really annoying; disable them.
        window.Mousetrap.bind("f", function() {});
        window.Mousetrap.bind("s", function() {});
    }
    setShortcuts();
    // Mostly to stop Lichess from accidentally overwriting Z with its shortcut for Zen mode.
    window.setTimeout(setShortcuts, 2000);
    window.setTimeout(setShortcuts, 5000);
    console.log("ready");
}, 200);})();
