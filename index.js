"use strict";
const { TypedEmitter: EventEmitter } = require('tiny-typed-emitter');


// WIRE PROTOCOL

/**
 * @typedef {(
 *     CommandWireMessage |
 *     ResponseWireMessage |
 *     EventWireMessage
 * )} WireMessage
 *
 * messages sent or received by {@link TransactionManager} through the underlying
 * transport are UTF-8 encoded JSON objects of this shape. this is an internal type,
 * and you won't need it unless you're writing your own version of `transaction-manager`.
 */

/**
 * @typedef {Object} CommandWireMessage
 * @property {"cmd"} type
 * @property {string} [namespace]
 * @property {string} name
 * @property {unknown} data
 * @property {number} transId
 */

/**
 * @typedef {Object} ResponseWireMessage
 * @property {"error" | "response"} type
 * @property {unknown} data
 * @property {number} transId
 */

/**
 * @typedef {Object} EventWireMessage
 * @property {"event"} type
 * @property {string} [namespace]
 * @property {string} name
 * @property {unknown} data
 */


// USER TYPE BOUNDS

/**
 * @typedef {Object} AllowedMessages
 * classes {@link TransactionManager} and {@link Namespace} accept a generic
 * argument of this shape that allows the user to type the payload of messages
 * (commands and events) that travel through the transport. types are given
 * separately for both directions.
 *
 * **note:** setting this only assumes a particular type for messages, it
 * doesn't cause any validation to be performed, you as the user are still
 * responsible for this (strongly recommended if messages come from an
 * untrusted source).
 * 
 * @property {AllowedMessagesDirection} rx - allowed incoming messages
 * @property {AllowedMessagesDirection} tx - allowed outgoing messages (fully enforcing these types would require an API change, right now a best effort is made)
 */

/**
 * @typedef {Object} AllowedMessagesDirection
 * messages allowed to flow in one direction
 * @property {Command} cmd - allowed commands
 * @property {Event} event - allowed events
 * @see AllowedMessages
 */

/**
 * @typedef {Object} Command
 * object produced for `cmd` (incoming command) events. user code must handle
 * the command described by `namespace`, `name` and `data`, and then call
 * `accept` or `reject` with the response payload. it is the user's responsibility
 * to ensure only a single call to one of the functions happens.
 *
 * this is a generic bound (see {@link AllowedMessages}) that the user is
 * expected to specialize; the `accept` and `reject` functions accept `never`
 * because of this (since function arguments are contravariant). if no
 * specialization is provided, the default ({@link UnknownCommand}) accepts `unknown`.
 *
 * @property {string} [namespace] - namespace through which command was sent
 * @property {string} name - command name
 * @property {unknown} data - command payload
 * @property {(data: never) => void} accept - function called to send a successful response to the command
 * @property {(data: never) => void} reject - function called to send an error response to the command
 */

/**
 * @typedef {Object} Event
 * object produced for `cmd` (incoming command) events. user code must handle
 *
 * @property {string} [namespace] - namespace through which command was sent
 * @property {string} name - command name
 * @property {unknown} data - command payload
 */

/**
 * @typedef {Command & {
 *     accept: (data: unknown) => void,
 *     reject: (data: unknown) => void,
 * }} UnknownCommand
 * default type parameter value for command
 * @see Command
 */

/**
 * @typedef {{
 *     rx: { cmd: UnknownCommand, event: Event },
 *     tx: { cmd: UnknownCommand, event: Event },
 * }} UnknownAllowedMessages
 */


// API IMPLEMENTATION

/**
 * @template {AllowedMessages} TMsg
 * @template {string} N
 * @typedef {Object} NamespaceEvents Events emitted by a {@link Namespace} instance.
 *
 * @property {(cmd:   TMsg['rx']['cmd']   & { namespace: N }) => void} cmd a command was received from the other peer
 * @property {(event: TMsg['rx']['event'] & { namespace: N }) => void} event an event was received from the other peer
 */

/**
 * Single namespace of a {@link TransactionManager}.
 * If created through {@link TransactionManager.namespace()}, this object sends and receives messages of a particular `namespace` value.
 *
 * @template {string} N
 * @template {AllowedMessages} [TMsg=UnknownAllowedMessages]
 *
 * @extends {EventEmitter<NamespaceEvents<TMsg, N>>}
 */
class Namespace extends EventEmitter
{
	constructor(
		/** @type {N} */ namespace,
		/** @type {TransactionManager<TMsg>} */ tm)
	{
		super();
		this.namespace = namespace;
		this.tm = tm;
	}
	
	/**
	 * send a command to the peer
	 * @template {TMsg['tx']['cmd']['name']} K
	 * @returns {Promise<Parameters<(TMsg['tx']['cmd'] & { namespace: N, name: K })['accept']>[0]>}
	 */
	cmd(
		/** @type {K} */ name,
		/** @type {(TMsg['tx']['cmd'] & { namespace: N, name: K })['data']} */ data)
	{
		return this.tm.cmd(name,data,this.namespace);
	}
	
	/**
	 * send an event to the peer
	 * @template {TMsg['tx']['event']['name']} K
	 */
	event(
		/** @type {K} */ name,
		/** @type {(TMsg['tx']['event'] & { namespace: N, name: K })['data']} */ data)
	{
		return this.tm.event(name,data,this.namespace);
	}
	
	close()
	{
		return this.tm.namespaces.delete(this.namespace);
	}
};

/**
 * @typedef {Object} Transaction
 * @property {(data: unknown) => void} resolve
 * @property {(data: unknown) => void} reject
 */

/**
 * @template {AllowedMessages} TMsg
 * @typedef {Object} TransactionManagerEvents Events emitted by a {@link TransactionManager} instance.
 *
 * @property {(cmd:   TMsg['rx']['cmd']  ) => void} cmd a command was received from the other peer
 * @property {(event: TMsg['rx']['event']) => void} event an event was received from the other peer
 */

/** @typedef {{ type: "binary", binaryData: ArrayBuffer } | { type: "utf8", utf8Data: string } | { data: string | Uint8Array } | string | Uint8Array} TransportMessage */

/** @typedef {(event: "message", listener: (msg: TransportMessage) => void) => void} TransportEventMethod */

/**
 * @typedef {(
 *   { send(data: string): void } & (
 *     { addEventListener: TransportEventMethod, removeEventListener: TransportEventMethod } |
 *     { addListener: TransportEventMethod, removeListener: TransportEventMethod }
 *   )
 * )} Transport
 *
 * interface of compatible transports that can be passed to a {@link TransactionManager}
 * instance. this includes, but is not limited to, websockets.
 */

/**
 * A transaction manager wrapping a WebSocket transport.
 * It is strongly recommended to specify the type parameter, see {@link AllowedMessages}.
 *
 * @template {AllowedMessages} [TMsg=UnknownAllowedMessages]
 *
 * @extends {EventEmitter<TransactionManagerEvents<TMsg>>}
 */
class TransactionManager extends EventEmitter
{
	constructor(/** @type {Transport} */ transport)
	{
		super();
		this.maxId = 0;
		this.namespaces = /** @type {Map<string, Namespace<string, TMsg>>} */ (new Map());
		this.transactions = /** @type {Map<number, Transaction>} */ (new Map());
		this.transport = /** @type {any} */ (transport);

		//Message event listener
		this.listener = (/** @type {any} */ msg) => {
			/** @type {WireMessage} */
			let message;
			
			try {
				//Process message
				message = JSON.parse(msg.utf8Data || msg.data || msg);
			} catch(e) {
				//Emit it
				//Ignore it
				return;
			}

			//Check type
			switch(message.type)
			{
				case "cmd" :
					//Create command
					const { transId } = message;
					const cmd = {
						name		: message.name,
						data		: message.data,
						namespace	: message.namespace,
						accept		: (/** @type {unknown} */ data) => {
							//Send response back
							this._send({
								type	 : "response",
								transId	 : transId,
								data	 : data
							});
						},
						reject	: (/** @type {unknown} */ data) => {
							//Send response back
							this._send({
								type	 : "error",
								transId	 : transId,
								data	 : data
							});
						}
					};
					
					//If it has a namespace
					if (cmd.namespace)
					{
						//Get namespace
						const namespace = this.namespaces.get(cmd.namespace);
						//If we have it
						if (namespace)
							//trigger event only on namespace
							namespace.emit("cmd",cmd);
						else
							//Launch event on main event handler
							this.emit("cmd",cmd);
					} else {
						//Launch event on main event handler
						this.emit("cmd",cmd);
					}
					break;
				case "response":
				{
					//Get transaction
					const transaction = this.transactions.get(message.transId);
					if (!transaction)
						return;
					//delete transacetion
					this.transactions.delete(message.transId);
					//Accept
					transaction.resolve(message.data);
					break;
				}
				case "error":
				{
					//Get transaction
					const transaction = this.transactions.get(message.transId);
					if (!transaction)
						return;
					//delete transacetion
					this.transactions.delete(message.transId);
					//Reject
					transaction.reject(message.data);
					break;
				}
				case "event":
					//Create event
					const event = {
						name		: message.name,
						data		: message.data,
						namespace	: message.namespace,
					};
					//If it has a namespace
					if (event.namespace)
					{
						//Get namespace
						var namespace = this.namespaces.get(event.namespace);
						//If we have it
						if (namespace)
							//trigger event
							namespace.emit("event",event);
						else
							//Launch event on main event handler
							this.emit("event",event);
					} else {
						//Launch event on main event handler
						this.emit("event",event);
					}
					break;
			}
		};
		
		//Add it
		this.transport.addListener ? this.transport.addListener("message",this.listener) : this.transport.addEventListener("message",this.listener);
	}
	
	/** @protected */
	_send(/** @type {WireMessage} */ msg)
	{
		this.transport.send(JSON.stringify(msg));
	}

	/**
	 * send a command to the peer
	 * @template {string} N
	 * @template {TMsg['tx']['cmd']['name']} K
	 * @returns {Promise<Parameters<(TMsg['tx']['cmd'] & { namespace: N, name: K })['accept']>[0]>}
	 */
	cmd(
		/** @type {K} */ name,
		/** @type {(TMsg['tx']['cmd'] & { namespace: N, name: K })['data']} */ data,
		/** @type {N | undefined} */ namespace = undefined)
	{
		return new Promise((resolve,reject) => {
			//Check name is correct
			if (!name || name.length===0)
				throw new Error("Bad command name");

			//Create command
			/** @type {CommandWireMessage} */
			const cmd = {
				type	: "cmd",
				transId	: this.maxId++,
				name	: name,
				data	: data
			};
			//Check namespace
			if (namespace)
				//Add it
				cmd.namespace = namespace;
			//Add to map
			this.transactions.set(cmd.transId, { ...cmd, resolve, reject });
			
			try {
				//Send json
				this._send(cmd);
			} catch (e) {
				//delete transacetion
				this.transactions.delete(cmd.transId);
				//rethrow
				throw e;
			}
		});
	}
	
	/**
	 * send an event to the peer
	 * @template {string} N
	 * @template {TMsg['tx']['event']['name']} K
	 */
	event(
		/** @type {K} */ name,
		/** @type {(TMsg['tx']['event'] & { namespace: N, name: K })['data']} */ data,
		/** @type {N | undefined} */ namespace = undefined)
	{
		//Check name is correct
		if (!name || name.length===0)
			throw new Error("Bad event name");
		
		//Create command
		/** @type {EventWireMessage} */
		const event = {
			type	: "event",
			name	: name,
			data	: data
		};
		//Check namespace
		if (namespace)
			//Add it
			event.namespace = namespace;
		//Send json
		this._send(event);

	}
	
	/**
	 * @template {string} N
	 * @returns {Namespace<N, TMsg>}
	 */
	namespace(/** @type {N} */ ns)
	{
		//Check if we already have them
		let namespace = /** @type {Namespace<N, TMsg>} */ (this.namespaces.get(ns));
		//If already have it
		if (namespace) return namespace;
		//Create one instead
		namespace = new Namespace(ns,this);
		//Store it
		this.namespaces.set(ns, namespace);
		//ok
		return namespace;
		
	}
	
	close()
	{
		//Erase namespaces
		for (const ns of this.namespaces.values())
			//terminate it
			ns.close();
		//remove lisnters
		this.transport.removeListener ? this.transport.removeListener("message",this.listener) : this.transport.removeEventListener("message",this.listener);
	}
};

module.exports = TransactionManager;
