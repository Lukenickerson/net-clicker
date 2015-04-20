RocketBoots.loadComponents([
	"coords",
	"sound_cannon",
	"image_overseer",
	"state_machine",
	//"data_delivery",
	"dice",
	"looper",
	//"entity",
	//"world",
	"time_count",
	"incrementer",
	"stage"
]);

var g = {};
RocketBoots.ready(function(){
	g = new RocketBoots.Game("Clicker");

	//console.log(RocketBoots);
	//g.coords = new rb.Coords();

	g.state.transition("preload");
	g.images.load({
		/*
		"dirt1" : "dirt1.png"
		,"dirt2" : "dirt2.png"
		,"grass1" : "grass1.png"
		,"grass2" : "grass2.png"
		*/
	});
	RocketBoots.loadScript("libs/mustache");
	
	// Load Data
	$.getJSON("data/startData.json",function(data){
		console.log("Data", data);
		g.enemyStartData = data.enemyStartData;
		g.playerStartData = data.playerStartData;
		console.log("startData is loaded.");
		$.getJSON("data/upgrades.json",function(data){
			g.upgrades = data.upgrades;
			g.start();
		});
	});
	
	// Load Sounds
	g.sounds.loadSounds(["background_beat_1"], "sounds/", "ogg");
	g.sounds.loadSounds(["beep", "bling", "no", "powerup", "zap", "damage"]);
	g.sounds.callback = function(b){
		$('.toggleSound .onOff').html( (b) ? "ON" : "OFF" );
	}
	g.sounds.musicCallback = function(b){
		$('.toggleMusic .onOff').html( (b) ? "ON" : "OFF" );
	};
	g.sounds.on().musicOff();
	
	// Helper functions
	g.roundTenths = function(n) {
		return parseInt(n*10)/10;
	}
	
	// Create a network class so functions can be shared
	// between player and enemy
	g.NetworkClass = function(selector, startData, inc){
		console.log("Creating Network", selector, g.cloneDataObject(startData));
		this.opponent = null;
		this.isEnemy = (selector == "#enemyNetwork") ? true : false;
		this.incrementer = inc;
		this.currencies = inc.currencies;
		this.$elt = $(selector);
		this.$hackersElt = this.$elt.find('.hackers');
		this.$currencyList = this.$elt.find('.currencyList');
		this.hackersCostPerSecond = 0;
		this.startData = startData;
		this.hackers = g.cloneDataObject(startData.hackers);
		if (typeof startData.innate == "object") {
			this.innate = g.cloneDataObject(startData.innate);
		} else {
			this.innate = {};
		}
		this.upgradesOwned = {};
		this.maxPerUpgrade = 20;
		this._construct();
	};

	//==== Setup
	g.NetworkClass.prototype._construct = function(){
		this.setupIncrementer();
		//this.resetValues(false);
		this.$elt.find('.networkName').html( this.startData.name );
	}
	g.NetworkClass.prototype.setupIncrementer = function(){
		console.log("setupIncrementer");
		var nodePoints = this.getNodePointsPerNode() * this.startData.nodeVal;
		// Setup basic currencies
		this.incrementer
			.addCurrency("nodes", "Nodes",		
				this.startData.nodeVal, 0, 0, this.startData.nodeVal
			)
			.addCurrency("nodePoints", "Security",	
				nodePoints, 0, 0, nodePoints
			)
			.addCurrency("info", "Info",
				100, 0, 0, 100
			)
			.addCurrency("money", "Money $",
				100, 0, 0, 1000
			);
		if (typeof this.innate.nodes === "undefined") this.innate.nodes = 0;
		if (typeof this.innate.nodePoints === "undefined") this.innate.nodePoints = 0;
		if (typeof this.innate.info === "undefined") this.innate.info = 0;
		if (typeof this.innate.money === "undefined") this.innate.money = 0;
		// Now reset
		this.resetValues(false);
		
		if (typeof this.startData.infoVal == "number") {
			this.currencies.info.val = this.startData.infoVal;
		} else {
			this.currencies.info.val = this.getInfoMax();
		}
		if (typeof this.startData.moneyVal == "number") {
			this.currencies.money.val = this.startData.moneyVal;
		} else {
			this.currencies.money.val = 0;
		}
	}
	
	//==== Gets
	g.NetworkClass.prototype.getHackersCostPerSecond = function(){
		return ((this.getTotalHackers() - 1) * 10);
	}
	g.NetworkClass.prototype.getTotalHackers = function(){
		var s, total = 0;
		for (s in this.hackers) {
			total += this.hackers[s];
		}
		return total;
	}
	g.NetworkClass.prototype.getMaxHackers = function(){
		return Math.ceil(this.currencies.nodes.val);
	}
	g.NetworkClass.prototype.getNextHireCost = function(){
		return (this.getTotalHackers() * 40) + 35;	
	}
	g.NetworkClass.prototype.getNodePointsPerNode = function(){
		var base = (this.isEnemy) ? 16 : 8;
		return (base + this.getUpgradeTotal("nodePointSizePerNode"));
	}
	g.NetworkClass.prototype.getNodesVal = function(){
		this.currencies.nodes.val = Math.ceil(
			this.currencies.nodePoints.val / this.getNodePointsPerNode()
		);
		return this.currencies.nodes.val;
	}	
	g.NetworkClass.prototype.getInfoMax = function(){
		return (
			this.currencies.nodes.val 
			* (16 + this.getUpgradeTotal("infoMaxPerNode"))
		);
	}
	g.NetworkClass.prototype.getMoneyMax = function(){
		return (16 + (
			this.currencies.nodes.val * 
			(16 + this.getUpgradeTotal("moneyMaxPerNode"))
		));
	}
	g.NetworkClass.prototype.ownsUpgrade = function(upgradeKey){
		return (typeof this.upgradesOwned[upgradeKey] == "number");
	}
	g.NetworkClass.prototype.getUpgrade = function(upgradeKey){
		var upgrade = g.cloneDataObject(g.upgrades[upgradeKey]);
		if (this.ownsUpgrade(upgradeKey)) {
			upgrade.count = this.upgradesOwned[upgradeKey];
		} else {
			upgrade.count = 0;
		}
		upgrade.nextCost = (
			upgrade.cost * Math.pow((upgrade.count + 1), upgrade.costExponent)
		);
		return upgrade;
	}
	g.NetworkClass.prototype.getUpgradeTotal = function(valueName){
		var u, total = 0, upgrade;
		for (u in this.upgradesOwned) {
			if (typeof g.upgrades[u][valueName] === "number") {		
				total += (g.upgrades[u][valueName] * this.upgradesOwned[u]);
			}
		}
		return total;
	}
	
	//==== Modify
	g.NetworkClass.prototype.addHacker = function(hackerJob){
		if (hackerJob == "idle") {
			var cost = this.getNextHireCost();
			if (this.currencies.money.val >= cost) {
				if (this.getTotalHackers() < this.getMaxHackers()) {
					this.currencies.money.add((-1 * cost));
					this.hackers.idle += 1;
					g.sounds.play("beep");
				} else {
					g.floatText("Not enough Nodes");
					g.sounds.play("no");
					//alert("Cannot hire more hackers\nNot enough nodes");
				}
			} else {
				// *** alert
				g.floatText("Not enough money - Need $" + cost + "k");
				g.sounds.play("no");
				//alert("Cannot hire more hackers\nNot enough money\n$" + cost + "k");
			}
		} else {
			if (this.hackers.idle > 0) {
				this.hackers.idle -= 1;
				this.hackers[hackerJob] += 1;
				g.sounds.play("beep");
			} else {
				var success = false;
				if (hackerJob != "developers" && this.hackers.developers > 0) {
					this.hackers.developers -= 1;
					success = true;
				} else if (hackerJob != "trolls" && this.hackers.trolls > 0) {
					this.hackers.trolls -= 1;
					success = true;
				} else if (hackerJob != "blackHats" && this.hackers.blackHats > 0) {
					this.hackers.blackHats -= 1;
					success = true;
				} else if (hackerJob != "sysAdmins" && this.hackers.sysAdmins > 0) {
					this.hackers.sysAdmins -= 1;
					success = true;
				}
				if (success) {
					this.hackers[hackerJob] += 1;
					g.sounds.play("beep");
				} else {
					g.sounds.play("no");
				}
			}
			g.state.get("game").update();
		}
		this.resetValues(true);
	}
	g.NetworkClass.prototype.removeHacker = function(hackerJob){
		if (hackerJob == "idle") {
			//this.hackers.idle -= 1;
			g.sounds.play("no");
		} else {
			if (this.hackers[hackerJob] > 0) {
				this.hackers.idle += 1;
				this.hackers[hackerJob] -= 1;
				g.sounds.play("beep");
			}
			g.state.get("game").update();
		}
		this.resetValues(true);
	}
	g.NetworkClass.prototype.buyUpgrade = function(upgradeKey){
		var upgrade = this.getUpgrade(upgradeKey);
		if (this.currencies.money.val >= upgrade.nextCost) {
			if (upgrade.count < this.maxPerUpgrade) {
				this.currencies.money.add( (-1 * upgrade.nextCost) );
				this.upgradesOwned[upgradeKey] = (upgrade.count + 1);
				g.floatText("Upgraded!");
				g.sounds.play("powerup");
				return true;
			} else {
				g.floatText("Don't be greedy");
				g.sounds.play("no");
				return false;
			}
		} else {
			g.floatText("Too Expensive");
			g.sounds.play("no");
			return false;
		}
	}

	
	//==== Resets
	g.NetworkClass.prototype.resetValues = function(resetOpp){
		var n = this;
		var curr = this.currencies;
		var infoSpaceLeft = (curr.info.max - curr.info.val);
		var moneySpaceLeft = (curr.money.max - curr.money.val);
		var nodePointsPerNode = n.getNodePointsPerNode();
		var nodesVal = n.getNodesVal();
		
		if (nodesVal < 1) console.log(nodesVal);
		curr.nodePoints.max = curr.nodes.max * nodePointsPerNode;
		curr.info.max 		= n.getInfoMax();
		curr.money.max 		= n.getMoneyMax();

		// Per Steps
		//console.log("opp", g.cloneDataObject(n.opponent));
		if (n.opponent != null) {
			var isOpponentDamaged = (n.opponent.currencies.nodePoints.val < n.opponent.currencies.nodePoints.max);
			var attackingDamage = (
				n.opponent.hackers.trolls * 
				(1 + n.opponent.getUpgradeTotal("damageMultiplier"))
			);
			curr.nodePoints.perStep = (
				n.innate.nodePoints
				+ n.hackers.sysAdmins 
				- attackingDamage
			);
			if (n.hackers.sysAdmins > 0) {
				curr.nodePoints.perStep += (
					n.getUpgradeTotal("nodePointsPerSecond")
					+ (nodesVal * n.getUpgradeTotal("nodePointsPerNode"))
				);
			}
			
			// get base espionage amount
			var espionageTransfer = n.hackers.blackHats;
			if (n.hackers.blackHats > 0) {
				espionageTransfer += n.getUpgradeTotal("espionagePerSecond");
			}
			// If opponent is not damaged, then get half info
			if (!isOpponentDamaged) espionageTransfer *= 0.5;
	
			espionageTransfer = Math.min(
				espionageTransfer
				,n.opponent.currencies.info.val
				,infoSpaceLeft
			);
			// Development
			var developmentTransfer = n.hackers.developers;
			if (n.hackers.developers > 0) {
				developmentTransfer +=  n.getUpgradeTotal("developmentPerSecond");
			}	
			developmentTransfer = Math.min(
				developmentTransfer
				,curr.info.val
				,moneySpaceLeft
			);
			// Info
			n.currencies.info.perStep = Math.min((
				n.innate.info
				+ espionageTransfer
				- developmentTransfer
				- n.opponent.hackers.blackHats
				+ n.getUpgradeTotal("infoPerSecond")
				+ (nodesVal * n.getUpgradeTotal("infoPerNode"))
			), infoSpaceLeft);
			
			n.currencies.money.perStep = Math.min((
				+ n.innate.money
				+ developmentTransfer 
				+ n.getUpgradeTotal("moneyPerSecond")
				+ (nodesVal * n.getUpgradeTotal("moneyPerNode"))
			), moneySpaceLeft);
			//console.log(n.currencies.money.perStep);
			
			// Rounding
			curr.nodePoints.perStep = g.roundTenths(curr.nodePoints.perStep);
			curr.info.perStep = g.roundTenths(curr.info.perStep);
			curr.money.perStep = g.roundTenths(curr.money.perStep);
			
			if (resetOpp) {
				this.opponent.resetValues(false);
			}
		}
	}
	
	//==== Update HTML
	g.NetworkClass.prototype.updateHTML = function(){
		this.updateCurrencyListItemsHTML();
		this.updateHackerHTML();		
	}
	g.NetworkClass.prototype.updateCurrencyListItemsHTML = function(){
		var h = '', units = '';
		this.incrementer.loopOverCurrencies(function(curr){
			if (curr.name == "money") units = '<span class="units">k</span>';
			else units = '';
			h += '<li class="currency ' + curr.name + '">'
				+ '<span class="name">' + curr.displayName + '</span>'
				+ '<span class="num' + ((curr.val <= 0) ? ' negative' : '')
				+ '">' + parseInt(curr.val) + units + '</span> '
				+ '/<span class="max">' + parseInt(curr.max) + units + '</span>'
				+ '<span class="perSecond">';
			if (curr.perStep != 0) {
				if (curr.perStep > 0) {
					h += '<span class="positive">+';
				} else {
					h += '<span class="negative">';
				}
				h += curr.perStep + '/sec</span>';
			}
			h += '</span></li>';
		});
		this.$currencyList.html(h);
	}
	g.NetworkClass.prototype.updateHackerHTML = function(){
		var hj, $he;
		for (hj in this.hackers) {
			$he = this.$hackersElt.find('.' + hj);
			$he.find('.num').html( this.hackers[hj] );
			if (this.hackers[hj] == 0) $he.addClass("zero");
			else $he.removeClass("zero");
		}
		this.$hackersElt.find('.max').html( this.getMaxHackers() );
		this.$hackersElt.find('.total').html( this.getTotalHackers() );
		this.$hackersElt.find('.costVal').html( this.getNextHireCost() );
	}
	
	
	//======== Create Instances of Networks
	// Make Enemy
	g.makeEnemy = function(level){
		console.log("Making enemy, level", level);
		var inc = new RocketBoots.Incrementer();
		g.enemy = new g.NetworkClass(
			'#enemyNetwork', g.enemyStartData[level], inc
		);
		g.enemy.isEnemy = true;
		g.connectPlayerAndEnemy();
		g.enemy.resetValues(false);
		return g.enemy;
	}
	// Connect them together in eternal struggle
	g.connectPlayerAndEnemy = function(){
		g.player.opponent 	= g.enemy;
		g.enemy.opponent 	= g.player;
		g.player.resetValues(true);
	}

	//======== Draw 
	g.drawUpgrades = function(){
		var h = "", u, i, upgrade;
		for (u in g.upgrades) {
			h += (
				'<li class="upgrade" data-upgradekey="' + u + '">'
				+ '<button type="button" class="add">+</button>'
				+ '<div>' + g.upgrades[u].name
			);
			upgrade = g.player.getUpgrade(u);
			h += '<span class="num">' + upgrade.count + '</span>';
			
			h += '<span class="tip">' + upgrade.tip + '</span>';
			h += '<span class="cost">Price: <span class="units">$</span>'
				+ g.roundTenths(upgrade.nextCost) 
				+ '<span class="units">k</span></span>';
			h += '<ol class="squares">';
			for (i = 0; i < g.player.maxPerUpgrade; i++) {
				if ((i + 1) <= upgrade.count) {
					h += '<li class="x"></li>'
				} else {
					h += '<li></li>';
				}
			}
			h += '</ol></div></li>';
		}
		var $ul = $('#upgrades > ul').first().html(h);
		$ul.find('.add').click(function(e){
			var isBought = g.player.buyUpgrade(
				$(this).closest('.upgrade').data("upgradekey")
			);
			if (isBought) {
				g.drawUpgrades();
				g.player.resetValues();
			}
		});
	}
	

	//======== Level up
	g.levelUp = function(){
		g.sounds.play("zap");
		g.level++;
		console.log($('.level'), (g.level + 1));
		$('.level').html(g.level + 1);
		g.player.currencies.nodes.max += g.enemy.currencies.nodes.max;
		g.player.currencies.money.val += g.enemy.currencies.money.val;
		if (g.level >= g.enemyStartData.length) {
			g.state.transition("win");
			return false;
		} else {
			g.makeEnemy( g.level );
			return true;
		}
	}
	g.level = 0;
	
	
	//======== Player specific functions
	var doHack = function(hackerJob){
		console.log("Hack as", hackerJob);
		if (g.player.hackers[hackerJob] <= 0) {
			g.sounds.play("no");
			return false;
		}
		var hackAmount = 0;
		switch(hackerJob){
			case "sysAdmins": 
				hackAmount = 1 + Math.floor(g.player.hackers.sysAdmins/8);
				g.player.currencies.nodePoints.add(hackAmount);
				g.floatText("+" + hackAmount + " Security", g.player.$currencyList.find('.nodePoints .num'));
				g.sounds.play("bling");
			break;
			case "blackHats":
				hackAmount = 1 + Math.floor(g.player.hackers.blackHats/8);
				if (g.enemy.currencies.info.val >= 1) {
					var isOpponentDamaged = (g.enemy.currencies.nodePoints.val < g.enemy.currencies.nodePoints.max);
					if (!isOpponentDamaged) hackAmount *= 0.5;
					g.player.currencies.info.add( hackAmount );
					g.enemy.currencies.info.add( hackAmount * -1 );
					g.floatText("+" + hackAmount + " Info", g.player.$currencyList.find('.info .num'));
					g.floatText("-" + hackAmount + " Info", g.enemy.$currencyList.find('.info .num'), "neg");
					g.sounds.play("bling");
				}
			break;
			case "trolls": 
				hackAmount = 1 + Math.floor(g.player.hackers.trolls/8);
				g.enemy.currencies.nodePoints.add(-1 * hackAmount);
				g.sounds.play("damage");
				g.floatText("-" + hackAmount + " Security", g.enemy.$currencyList.find('.nodePoints .num'), "neg");
			break;
			case "developers": 
				hackAmount = 1 + Math.floor(g.player.hackers.developers/8);
				if (g.player.currencies.info.val >= hackAmount) {
					g.player.currencies.info.add(-1 * hackAmount);
					g.player.currencies.money.add(hackAmount);
					g.floatText("-" + hackAmount + " Info: +$" + hackAmount + "k", g.player.$currencyList.find('.money .num'));
					g.sounds.play("bling");
				} else {
					g.player.currencies.money.add(0.1);
					g.floatText("+$100", g.player.$currencyList.find('.money .num'));
					g.sounds.play("bling");
				}
			break;
		}
		g.state.get("game").update();
		return true;
	}

	g.mousePos = { "x" : 0, "y" : 0 };
	g.floatText = function(t, $target, myClass){
		var $ft = $('<div class="floatText">' + t + '</div>');
		if (myClass) $ft.addClass(myClass);
		var animObj = {
			"top" : 0,
			"opacity" : 0
		};
		if ($target) {
			var offset = $target.offset();
			animObj.left = offset.left;
			animObj.top = offset.top;
		}
		var startY =  g.mousePos.y - 70 + g.dice.roll1d(30);
		var startX = g.mousePos.x - 50 - g.dice.roll1d(40);
		$ft.css({
			"top" : startY,
			"left" : startX
		});
		$('body').append($ft);
		$ft.animate({ "top": startY - (10 + g.dice.roll1d(40)) }, 500, function(){
			$ft.animate(animObj, 1000, function(){
				$ft.remove();
			});
		});
	}
	
	//==== Setup Actions
	g.setupActions = function(){
		var getElementHackerJob = function(elt){
			return $(elt).closest('.hackerJob').data("hackerjob");
		}
		g.player.$hackersElt.find('.add').click(function(e){
			g.player.addHacker( getElementHackerJob(this) );
		}).end().find('.remove').click(function(e){
			g.player.removeHacker( getElementHackerJob(this) );
		});
		g.player.$hackersElt.find('.hack').click(function(e){
			doHack( getElementHackerJob(this) );
		});
		g.player.$elt.find('.currencyList').click(function(e){
			doHack("sysAdmins");
		});
		g.enemy.$elt.find('.currencyList').click(function(e){
			doHack("blackHats");
		});
		$('.toggleGameView').click(function(e){
			var $this = $(this);
			$('.game nav button').removeClass("selected");
			if ($this.hasClass("enemyGameView")) {
				$('#upgrades').hide(400);
				$('#enemyNetwork').show(500);
				$this.addClass("selected");
			} else if ($this.hasClass("upgradesGameView")) {
				$('#enemyNetwork').hide(400);
				$('#upgrades').show(500);				
				$this.addClass("selected");
			}
		});
		$('.refreshPage').click(function(e){
			window.location.reload();
		});
		$('.giveMoney').click(function(e){
			g.player.currencies.money.add(100);
		});
		$('.toggleSound').click(function(e){
			g.sounds.toggle();
		});
		$('.toggleMusic').click(function(e){
			g.sounds.toggleMusic();
		});
		$('nav button').click(function(e){
			g.sounds.play("beep");
		});
		$('#playerNetwork > h1').click(function(e){
			var $this = $(this);
			var t = window.prompt("Rename your network:", $this.text());
			if (!t) t = "Your Network";
			$this.html(t);
		});
		$(document).mousemove(function(e) {
			g.mousePos.x = e.pageX;
			g.mousePos.y = e.pageY;
		});
	}
	
	//==== Setup States and transitions
	g.state.add("levelUp", { 
		start: function(){
			if (g.levelUp()) this.$view.fadeIn();
		}
	}).add("win").add("lose");
	
	g.state.get("game").setStart(function(){
		this.$view.show();
		g.sounds.play("background_beat_1", true);
		g.loop.start();
	}).setEnd(function(){
		this.$view.hide();
		g.sounds.stop("background_beat_1");
		$('.floatText').remove();
		g.loop.stop();
	}).setUpdate(function(){
		g.player.resetValues(true);
		g.player.updateHTML();
		g.enemy.updateHTML();
	});


	g.start = function(){
		g.player = new g.NetworkClass(
			'#playerNetwork', g.playerStartData, g.incrementer
		);
		g.makeEnemy(0);
		g.setupActions();
		g.drawUpgrades();
		g.state.transition("mainmenu");
		
		//==== Loop
		// Create loop
		g.loop = new rb.Looper(function(){
			//g.stage.draw();
		});
		
		// Setup loop actions
		g.loop.addModulusAction(2, function(){
			if (g.enemy.currencies.nodes.val <= 0) {
				g.state.transition("levelUp");
			} else if (g.player.currencies.nodes.val <= 0) {
				g.state.transition("lose");
			}
			g.player.resetValues(true);
			g.player.incrementer.increment(0.5);
			g.enemy.incrementer.increment(0.5);
			g.state.get("game").update();
		});
		g.loop.addModulusAction(1, function(){
			if (g.player.currencies.nodePoints.perStep < 0 ||
				g.enemy.currencies.nodePoints.perStep < 0) {
				g.sounds.play("damage");
			}
		});
		// Quick-Start for development
		//g.state.transition("game");		
	};

	
});