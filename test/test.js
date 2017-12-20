const TransactionManager = require("../index.js");


const t1 = {};
const t2 = {};

t1.addEventListener = function(name,handler) {
	t1["on"+name] = handler;
};
t2.addEventListener = function(name,handler) {
	t2["on"+name] = handler;
};

var tm1 = new TransactionManager(t1);
var tm2 = new TransactionManager(t2);


t1.send = function(msg) {
	t2.onmessage({
		data: msg
	});
};
t2.send = function(msg) { 
	t1.onmessage({
		data: msg
	});
};

tm2.on("cmd",(cmd)=> {
	console.log("t2::got command", cmd.name);
	switch(cmd.name) 
	{
		case "accept" :
			console.log("t2::sending event 1");
			tm2.event("event1");
			cmd.accept("accepted");
			break;
		case "reject" :
			cmd.reject("reject");
			break;
	}
});

tm1.on("event",(event) => {
	console.log("t1::got event", event.name);
});

console.log("t1::sending accept cmd");
tm1.cmd("accept")
	.then(() => {
		console.log("t1::command accepted");
	});
	
console.log("t1::sending reject cmd");
tm1.cmd("reject")
	.catch((error) => {
		console.error(error);
		console.log("t1::command rejected");
	});
	
