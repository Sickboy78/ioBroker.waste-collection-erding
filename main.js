'use strict';

/*
 * Created with @iobroker/create-adapter v2.6.5
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here
const https = require('https');

const ADAPTER_VERSION = '0.0.1';
const REQUEST_TIMEOUT = 120000;
const CHANNEL_EVENTS = 'events';
const CHANNEL_INFO = 'info';
const CHANNEL_NEXT_EVENT = 'nextEvent';

class WasteCollectionErding extends utils.Adapter {

	/**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
	constructor(options) {
		super({
			...options,
			name: 'waste-collection-erding',
		});
		this.on('ready', this.onReady.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	/**
     * Is called when databases are connected and adapter received configuration.
     */
	async onReady() {
		// Initialize your adapter here
		this.log.info(`starting Waste Collection Erding Adapter v` + ADAPTER_VERSION);
		this.setState(CHANNEL_INFO + '.version', ADAPTER_VERSION, true);

		// check adapter config for invalid values
		this.checkAdapterConfig()
			.then(() => this.getNextEvents())
			.then((data) => this.getNextEventsAsCalenderEvents(data))
			.then((data) => this.updateEvents(data))
			.then((data) => this.updateNextEvents(data))
			.then(() => this.setLastUpdateToAdapter())
			.catch(error => {
				this.log.error(error);
				this.log.warn(`updating next events failed`);
			})
			.finally(() => {
				this.terminate ? this.terminate('updating next events finished. sleeping until next run.') :process.exit(0);
			});
	}

	/**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
	onUnload(callback) {
		try {
			callback();
		} catch (e) {
			callback();
		}
	}

	/**
     * checks and logs the values of the adapter configuration
     *
     * @return {Promise<void>}
     */
	checkAdapterConfig() {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			// The adapters config (in the instance object everything under the attribute "native") is accessible via
			// this.config:
			let configOk = true;
			this.log.info('checking adapter configuration...');
			if (!this.config.place_id || typeof this.config.place_id !== 'string' || this.config.place_id.length === 0) {
				this.log.error(`PlaceId is invalid.`);
				configOk = false;
			}
			if (!this.config.district_id || typeof this.config.district_id !== 'string' || this.config.district_id.length === 0) {
				this.log.error(`DistrictId is invalid.`);
				configOk = false;
			}
			if (!this.config.fraction_ids || typeof this.config.fraction_ids !== 'string' || this.config.fraction_ids.length === 0) {
				this.log.error(`FractionIds is invalid.`);
				configOk = false;
			}
			this.log.info('PlaceId: ' + this.config.place_id);
			this.log.info('DistrictId: ' + this.config.district_id);
			this.log.info('FractionIds: ' + this.config.fraction_ids);

			if(configOk) {
				this.log.info('adapter configuration ok');
				return resolve();
			} else {
				this.log.info('adapter configuration contains errors');
				return reject(new Error('adapter configuration contains errors'));
			}
		}));
	}

	/**
     * get next events from API
     *
     * @returns {Promise<Object>}
     */
	getNextEvents() {
		return /** @type {Promise<Object>} */(new Promise((resolve, reject) => {
			const interestData = '[{"placeId":"' + this.config.place_id +
                '","districtId":"' + this.config.district_id +
                '","fractionIds":' + this.config.fraction_ids +
                ',"categoryIds":[]}]';
			this.log.silly('interestData: "' + interestData + '"');
			const options = this.buildOptions('portal.awido.de','/api/Calendar/GetNextEvents?amount=1&target=null', interestData);
			this.log.silly('options: "' + JSON.stringify(options) + '"');
			this.httpRequest(options, 'next events').then(result => {
				this.log.silly('result: "' + JSON.stringify(result) + '"');
				if (result === undefined) {
					return reject(new Error(`Getting next events failed.`));
				} else {
					if(Array.isArray(result)) {
						return resolve(result);
					} else {
						return reject(new Error(`Received object is not an array.`));
					}
				}
			}).catch(error => {
				return reject(error);
			});
		}));
	}

	/**
     * get next events as calendar from API
     *
     * @param {Object} eventData
     * @returns {Promise<Object>}
     */
	getNextEventsAsCalenderEvents(eventData) {
		return /** @type {Promise<Object>} */(new Promise((resolve, reject) => {
			const interestData = '[{"placeId":"' + this.config.place_id +
                '","districtId":"' + this.config.district_id +
                '","fractionIds":' + this.config.fraction_ids +
                ',"categoryIds":[]}]';
			this.log.silly('interestData: "' + interestData + '"');
			const options = this.buildOptions('portal.awido.de','/api/Events/GetNextEventsAsCalendarEvents?amount=1&target=null', interestData);
			this.log.silly('options: "' + JSON.stringify(options) + '"');
			this.httpRequest(options, 'next calendar events').then(result => {
				this.log.silly('result: "' + JSON.stringify(result) + '"');
				if (result === undefined) {
					return reject(new Error(`Getting next events as calender events failed.`));
				} else {
					if(Array.isArray(result)) {
						if(result.length > 0) {
							return resolve(eventData.concat(result));
						} else {
							return resolve(eventData);
						}
					} else {
						return reject(new Error(`Received object is not an array.`));
					}
				}
			}).catch(error => {
				return reject(error);
			});
		}));
	}

	/**
     * update events
     *
     * @param {Object} data
     * @returns {Promise<Object>}
     */
	updateEvents(data) {
		return /** @type {Promise<Object>} */(new Promise((resolve, reject) => {
			if(data && typeof data === 'object' && Array.isArray(data) && data.length > 0) {
				this.setObjectNotExistsAsync(CHANNEL_EVENTS + '.json', this.buildStateObject('events as json', 'json', 'string'))
					.then(() => {this.setState(CHANNEL_EVENTS + '.json', JSON.stringify(data), true);});
				data.forEach((event) => {
					if('shortName' in event && event.shortName !== undefined && 'title' in event && event.title !== undefined) {
						const objName = CHANNEL_EVENTS + '.' + event.shortName;
						this.setObjectNotExistsAsync(objName, this.buildChannelObject(event.title)).then(() => {
							this.setEventToAdapter(objName, event);
						});
					}
				});
				return resolve(data);
			} else {
				return reject(new Error(`Received data is empty or invalid.`));
			}
		}));
	}

	/**
     * update next events
     *
     * @param {Object} data
     * @returns {Promise<Object>}
     */
	updateNextEvents(data) {
		return /** @type {Promise<Object>} */(new Promise((resolve, reject) => {
			if(data && typeof data === 'object' && Array.isArray(data) && data.length > 0) {
				const nextEvents = Array();
				data.forEach((event) => {
					if('type' in event && event.type !== undefined && 'date' in event && event.date !== undefined) {
						if((!(event.type in nextEvents) || nextEvents[event.type].date > event.date) && !this.isToday(new Date(event.date))) {
							nextEvents[event.type] = event;
						}
					}
				});
				nextEvents.forEach((event) => {
					if('type' in event && event.type !== undefined) {
						const objName = CHANNEL_NEXT_EVENT + '.' + event.type;
						this.setObjectNotExistsAsync(objName, this.buildChannelObject('next event of type ' + event.type)).then(() => {
							this.setEventToAdapter(objName, event);
						});
					}
				});
				return resolve(data);
			} else {
				return reject(new Error(`Received data is empty or invalid.`));
			}
		}));
	}

	/**
     * set an event to the adapter
     *
     * @param {String} objName
     * @param {Object} event
     */
	setEventToAdapter(objName, event) {
		if('title' in event && event.title !== undefined) {
			this.setObjectNotExistsAsync(objName + '.title', this.buildStateObject('title', 'name', 'string'))
				.then(() => {
					this.setState(objName + '.title', event.title, true);
				});
		}
		if('shortName' in event && event.shortName !== undefined) {
			this.setObjectNotExistsAsync(objName + '.shortName', this.buildStateObject('shortName', 'name', 'string'))
				.then(() => {
					this.setState(objName + '.shortName', event.shortName, true);
				});
		}
		if('date' in event && event.date !== undefined) {
			this.setObjectNotExistsAsync(objName + '.date', this.buildStateObject('date', 'date', 'string'))
				.then(() => {
					this.setState(objName + '.date', event.date, true);
				});
			this.setObjectNotExistsAsync(objName + '.localeDate', this.buildStateObject('localeDate', 'text', 'string'))
				.then(() => {
					this.setState(objName + '.localeDate', new Date(event.date).toLocaleDateString(undefined,{year: 'numeric', month: '2-digit', day: '2-digit'}), true);
				});
			this.setObjectNotExistsAsync(objName + '.weekday', this.buildStateObject('weekday', 'date', 'string'))
				.then(() => {
					this.setState(objName + '.weekday', new Date(event.date).toLocaleDateString(undefined,{weekday: 'long'}), true);
				});
			this.setObjectNotExistsAsync(objName + '.shortWeekday', this.buildStateObject('shortWeekday', 'date', 'string'))
				.then(() => {
					this.setState(objName + '.shortWeekday', new Date(event.date).toLocaleDateString(undefined,{weekday: 'short'}), true);
				});
		}
		if('subtitle' in event && event.subtitle !== undefined) {
			this.setObjectNotExistsAsync(objName + '.subtitle', this.buildStateObject('subtitle', 'location', 'string'))
				.then(() => {
					this.setState(objName + '.subtitle', event.subtitle, true);
				});
		}
		if('imagePath' in event && event.imagePath !== undefined) {
			this.setObjectNotExistsAsync(objName + '.imagePath', this.buildStateObject('imagePath', 'text.url', 'string'))
				.then(() => {
					this.setState(objName + '.imagePath', event.imagePath, true);
				});
		}
		if('type' in event && event.type !== undefined) {
			this.setObjectNotExistsAsync(objName + '.type', this.buildStateObject('type', 'value.type', 'number'))
				.then(() => {
					this.setState(objName + '.type', event.type, true);
				});
		}
		if('hasReminder' in event && event.hasReminder !== undefined) {
			this.setObjectNotExistsAsync(objName + '.hasReminder', this.buildStateObject('hasReminder', 'indicator', 'boolean'))
				.then(() => {
					this.setState(objName + '.hasReminder', event.hasReminder, true);
				});
		}
		if('color' in event && event.color !== undefined) {
			this.setObjectNotExistsAsync(objName + '.color', this.buildStateObject('color', 'color.rgb', 'string'))
				.then(() => {
					this.setState(objName + '.color', event.color, true);
				});
		}
		if('backgroundColor' in event && event.backgroundColor !== undefined) {
			this.setObjectNotExistsAsync(objName + '.backgroundColor', this.buildStateObject('backgroundColor', 'color.rgb', 'string'))
				.then(() => {
					this.setState(objName + '.backgroundColor', event.backgroundColor, true);
				});
		}
	}

	/**
     * set the last time data was updated
     *
     * @return {Promise}
     */
	setLastUpdateToAdapter() {
		return this.setState(CHANNEL_INFO + '.lastUpdate', new Date().toString(), true);
	}

	/**
     * build a channel object
     *
     * @param {String} name
     * @return {ioBroker.SettableChannelObject}
     */

	buildChannelObject(name) {
		return {
			type: 'channel',
			common: {
				name: name,
				role: ''
			},
			native: {}
		};
	}

	/**
     * build a state object
     *
     * @param {String} name
     * @param {String} role
     * @param {ioBroker.CommonType} type
     * @param {Boolean} readonly
     * @return {ioBroker.SettableStateObject}
     */
	buildStateObject(name, role = 'indicator', type = 'boolean', readonly = true) {
		return {
			type: 'state',
			common: {
				name: name,
				role: role,
				type: type,
				read: true,
				write: !readonly
			},
			native: {}
		};
	}

	/**
     * build an options JSon object for a http request
     *
     * @param {String} host
     * @param {String} path
     * @param {String} interestData
     * @return {Object}
     */
	buildOptions(host, path, interestData) {
		return {
			hostname: host,
			port: 443,
			path: path,
			method: 'GET',
			gzip: true,
			timeout: REQUEST_TIMEOUT,
			headers: {
				'Accept' : 'application/json, text/plain, */*',
				'Accept-Language' : 'en-US,en;q=0.9',
				'Cache-Control' : 'no-cache',
				'Connection' : 'keep-alive',
				'Customer' :  'erding',
				'Host' : host,
				'InterestData' : interestData,
				'Origin' : 'https://portal.awido.de',
				'Referer' : 'https://portal.awido.de/',
				'Sec-Fetch-Dest' : 'empty',
				'Sec-Fetch-Mode' : 'cors',
				'Sec-Fetch-Site' : 'cross-site',
				'User-Agent' : 'ioBroker/7.0',
				'X-Requested-With' : 'com.webapp.erding'
			}
		};
	}

	/**
     * do a http request
     *
     * @param {Object} options
     * @param {string} tag
     * @return {Promise<Object>} Promise of an response JSon object
     */
	httpRequest(options, tag) {
		return new Promise((resolve, reject) => {
			this.log.debug(`doing http request for ${tag}`);
			const req = https.request(options, (res) => {
				if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
					this.log.debug(`Request returned status code ${res.statusCode}.`);
					return reject(new Error(`Request returned status code ${res.statusCode}.`));
				} else {
					const data = [];
					res.on('data', (chunk) => {
						data.push(chunk);
					});
					res.on('end', () => {
						try {
							const obj = JSON.parse(data.join(''));
							return resolve(obj);
						} catch (err) {
							if (err instanceof Error) {
								this.log.debug(`Json parse error in data: '${data}.'`);
							}
							this.log.debug(`Response error.`);
							return reject(new Error(`Response error: '${err}'.`));
						}
					});
					res.on('error', (err) => {
						this.log.debug(`Response error.`);
						return reject(new Error(`Response error: '${err}'.`));
					});
				}
			});

			req.on('error', (err) => {
				this.log.debug(`Request error.`);
				return reject(new Error(`Request error: '${err}'.`));
			});

			req.on('timeout', () => {
				req.destroy();
				this.log.debug(`Request timeout.`);
				return reject(new Error(`Request timeout.`));
			});

			req.end();
		});
	}

	/**
     * return whether the date is today
     *
     * @param {Date} date
     * @returns true if the date is today, false otherwise
     */
	isToday(date) {
		const today = new Date();
		return today.getFullYear() === date.getFullYear() && today.getMonth() === date.getMonth() && today.getDate() === date.getDate();
	}
}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
	module.exports = (options) => new WasteCollectionErding(options);
} else {
	// otherwise start the instance directly
	new WasteCollectionErding();
}