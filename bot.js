let input = "https://backpack.tf/item/";
let maxTime = 2 * 30 * 24 * 60 * 60; // 3 months


const cheerio = require('cheerio')
const request = require('request');
const nearest = require('nearest-date')
 

function getHistory(original_id) {
	return new Promise(function(resolve, reject) {
		request("https://backpack.tf/item/" + original_id, function(err, resp, body) {
			if (err) {
				reject(err);
				return;
			}
			
			const $ = cheerio.load(body);
			
			let history = [];
			
			let historyEntries = $(".history-sheet table tbody").find("tr");
			
			for (let i = 0; i < historyEntries.length; i++) {
				let item = historyEntries[i];
				
				let historyItem = {
					user: {}
				};
				
				//console.log({item})
				
				historyItem.assetid = $(item).children("td:nth-child(1)").text().trim();
				
				historyItem.user.steamid = $(item).children("td:nth-child(2)").find('.user-link',0).attr('data-id');
				historyItem.user.displayname = $(item).children("td:nth-child(2)").text().trim();
				
				historyItem.lastseen = Date.parse($(item).children("td:nth-child(3)").text()) / 1000;
				
				history.push(historyItem);
			}
			resolve(history);
		});	
	});	
}

async function findCompares(owner, tradee, time, original_id) {
	return new Promise(async function(resolve, reject) {
		let timespans = await getInventoryHistory(owner);
		
		let addedTimespan = 1 * 24 * 60 * 60; //1 days
		
		var highdates = [];
		var hightimestamps = [];
		var lowdates = [];
		var lowtimestamps = [];
		var alldates = [];
		var alltimestamps = [];
		
		var dates = {};
		var datesT = {};
		
		for (let i = 0; i < timespans.length; i++) {
			if (timespans[i].timestamp > time + addedTimespan) {
				highdates.push( new Date(timespans[i].timestamp * 1000) );
				hightimestamps.push(timespans[i].timestamp);
			}
			else if (timespans[i].timestamp < time - addedTimespan) {
				lowdates.push( new Date(timespans[i].timestamp * 1000) );
				lowtimestamps.push(timespans[i].timestamp);
			}
			alldates.push( new Date(timespans[i].timestamp * 1000) );
			alltimestamps.push(timespans[i].timestamp);
			dates[timespans[i].timestamp] = timespans[i].formatted;
			datesT[timespans[i].formatted] = timespans[i].timestamp;
		}
		
		
		
		var target = new Date(time * 1000);
		var highWinner = nearest(highdates, target);
		var lowWinner = nearest(lowdates, target);
		
		
		console.log("Target was " + target.toLocaleDateString("en-US"))
		console.log("Found a high for " + dates[hightimestamps[highWinner]] + "( " + hightimestamps[highWinner] + " )")
		console.log("Found a low for " + dates[lowtimestamps[lowWinner]] + "( " + lowtimestamps[lowWinner] + " )")
		
		let lasturl = "";
		
		let low = lowtimestamps[lowWinner];
		let high = hightimestamps[highWinner];
		
		console.log(low, high);
		
		// let mid = low;
		// for (let i = 0; i < timespans.length; i++) {
			// let item = timespans[i];
			// if (item.timestamp < high && item.timestamp > low) {
				// mid = item.timestamp;
				// console.log("eeeeeeeee");
				// break;
			// }
		// }
		
		var dateString =
			target.getUTCFullYear() + "-" +
			("0" + (target.getUTCMonth()+1)).slice(-2) + "-" +
			("0" + target.getUTCDate()).slice(-2);
		
		//
		if (datesT[dateString]) {
			var mid = datesT[dateString];
		}
		else {
			var mid = alltimestamps[nearest(alldates, target)];
		}
		
		console.log("Found a mid for " + dates[mid] + "( " + mid + " )")
		// let mid = alltimestamps[midWinner];
		
		
		//find an estimate when exactly
		let estimateCompare = await getComparesContent(owner, low, high)
		//console.log(estimateCompare);
		
		let mode = "Untraceable";
		
		console.log("Checked LOW <=> HIGH")
		if (estimateCompare.bins.added[original_id] || estimateCompare.bins.removed[original_id]) {
			mode = ((estimateCompare.bins.added[original_id]) ? "Added" : "Removed");
			lasturl = `https://backpack.tf/profiles/${owner}#!/compare/${low}/${high}`;
			console.log(`https://backpack.tf/profiles/${owner}#!/compare/${low}/${high}`);
			console.log("Found.");
		}
		
		//replace high with mid and check again, after that we check the way arround
		console.log(low, high, mid)
		if (mid != high && mid != low) {
			//first repalce high with mid
			let closerCompare = await getComparesContent(owner, low, mid)
			//console.log(estimateCompare);

			console.log("Checked LOW <=> MID")
			
			if (closerCompare.bins.added[original_id] || closerCompare.bins.removed[original_id]) {
				mode = ((closerCompare.bins.added[original_id]) ? "Added" : "Removed");
				lasturl = `https://backpack.tf/profiles/${owner}#!/compare/${low}/${mid}`;
				console.log(`https://backpack.tf/profiles/${owner}#!/compare/${low}/${mid}`);
				console.log("Found.");
			}
			else {
				//first repalce high with mid
				let closerCompare = await getComparesContent(owner, mid, high)
				//console.log(estimateCompare);

				console.log("Checked MID <=> HIGH")
				
				if (closerCompare.bins.added[original_id] || closerCompare.bins.removed[original_id]) {
					mode = ((closerCompare.bins.added[original_id]) ? "Added" : "Removed");
					lasturl = `https://backpack.tf/profiles/${owner}#!/compare/${mid}/${high}`;
					console.log(`https://backpack.tf/profiles/${owner}#!/compare/${mid}/${high}`);
					
					console.log("Found.");
				}
				else {
					mode = "Untrace";
					lasturl = `https://backpack.tf/profiles/${owner}#!/compare/${low}/${high}`;
				}
			}
		}
		resolve({mode: mode, url: lasturl});
		console.log("**" + lasturl);
	});
}

function getComparesContent(owner, lowtimestamp, hightimestamp) {
	return new Promise(function(resolve, reject) {
		let url = `https://backpack.tf/_inventory_cmp/${owner}/${lowtimestamp}/${hightimestamp}`
		request(url, function(err, resp, body) {
			if (err) {
				reject(err);
				return;
			}
			
			resolve(JSON.parse(body));
		});
	});
}

function getInventoryHistory(steamid) {
	return new Promise(function(resolve, reject) {
		request("https://backpack.tf/_inventory_history/"+steamid, function(err, resp, body) {
			if (err) {
				reject(err);
				return;
			}
			
			resolve(JSON.parse(body));
		});
	});
}

async function main(original_id) {
	let history = await getHistory(original_id);
	
	let useable = [];
	
	//handle history
	for (let i = 0; i < history.length; i++) {
		let item = history[i];
		
		if (item.lastseen + maxTime < getUnix()) 
			continue;
		
		if (history[i + 1] && item.user.steamid == history[i + 1].user.steamid)
			continue;
		
		useable.push(item);
	}
	console.log(useable);
	let sales = [];

	
	for (let i = 0; i < useable.length - 1; i++) {
		let item = useable[i];
		let nextitem = useable[i + 1];
		console.log("Sale " + (i + 1) + ")");
		
		let url1 = await findCompares(item.user.steamid, nextitem.user.steamid, nextitem.lastseen, original_id);
		console.log();
		console.log();
		console.log();
		let url2 = await findCompares(nextitem.user.steamid, item.user.steamid, nextitem.lastseen, original_id);
		sales[i] = {
			info: {
				to: item.user,
				from: nextitem.user
			}
		};
		sales[i]["sales"] = [url1,url2];
		//break;
	}
	console.log();
	console.log();
	for (let i = 0; i < sales.length; i++) {
		let item = sales[i];
		let untrace = false;
		let cause = null;
		
		console.log("**" + item.info.from.displayname + " => " + item.info.to.displayname + "**");
		
		for (let j = 0; j < item.sales.length; j++) {
			console.log(item.sales[j].url + " " + item.sales[j].mode);
			if (item.sales[j].mode == "Untrace ")
				untrace = true;
		}
		
		if (item.info.from.displayname.startsWith("ScrapTF") || item.info.to.displayname.startsWith("ScrapTF")) {
			cause = "Scrap.TF";
		}if (item.info.from.displayname.startsWith("Marketplace.TF") || item.info.to.displayname.startsWith("Marketplace.TF")) {
			cause = "Marketplace.TF";
		}
		
		console.log(((untrace == true) ? "Untraceable " : "") + ((cause) ? cause : ""));
		console.log();
	}
}

function getUnix() {
	return Math.round((new Date()).getTime() / 1000);
}
console.log(process.argv);

main(process.argv[process.argv.length - 1]);