"use strict";
 const EventEmitter = require('events');

class TransactionManager extends EventEmitter
{
	constructor(transport)
	{
		super();
		this.maxId = 0;
		this.transactions = new Map();
		this.transport = transport;
		
		//Message event listener
		var listener = (msg) => {
			//Process message
			var message = JSON.parse(msg.utf8Data || msg.data);

			//Check type
			switch(message.type)
			{
				case "cmd" :
					//Create command
					const cmd = {
						name	: message.name,
						data	: message.data,
						accept	: (data) => {
							//Send response back
							transport.send(JSON.stringify ({
								type	 : "response",
								transId	 : message.transId,
								accepted : true,
								data	 : data
							}));
						},
						reject	: (data) => {
							//Send response back
							transport.send(JSON.stringify ({
								type	 : "response",
								transId	 : message.transId,
								accepted : false,
								data	 : data
							}));
						}
					};
					//Launch event
					this.emit("cmd",cmd);
					break;
				case "response":
					//Get transaction
					const transaction = this.transactions.get(message.transId);
					if (!transaction)
						return;
					//delete transacetion
					this.transactions.delete(message.transId);
					if (message.accepted)
						transaction.resolve(message.data);
					else
						transaction.reject(message.data);
					
					break;
				case "event":
					//Create event
					const event = {
						name	: message.name,
						data	: message.data,
					};
					//Launch event
					this.emit("event",event);
					break;
			}
		};
		
		//Add it
		this.transport.addListener ? this.transport.addListener("message",listener) : this.transport.addEventListener("message",listener);
	}
	
	cmd(name,data) 
	{
		return new Promise((resolve,reject) => {
			//Check name is correct
			if (!name || name.length===0)
				throw new Error("Bad command name");

			//Create command
			const cmd = {
				type	: "cmd",
				transId	: this.maxId++,
				name	: name,
				data	: data
			};
			//Serialize
			const json = JSON.stringify(cmd);
			//Add callbacks
			cmd.resolve = resolve;
			cmd.reject  = reject;
			//Add to map
			this.transactions.set(cmd.transId,cmd);
			
			try {
				//Send json
				this.transport.send(json);
			} catch (e) {
				//delete transacetion
				this.transactions.delete(cmd.transId);
				//rethrow
				throw e;
			}
			
		});
	}
	
	event(name,data) 
	{
		//Check name is correct
		if (!name || name.length===0)
			throw new Error("Bad event name");
		
		//Create command
		const event = {
			type	: "event",
			name	: name,
			data	: data
		};
		//Serialize
		const json = JSON.stringify(event);
		//Send json
		this.transport.send(json);

	}
};

module.exports = TransactionManager;