/*
 *     Copyright (C) 2017 Shotaro Uchida
 *
 *     The MIT License (MIT)
 *
 *     Permission is hereby granted, free of charge, to any person obtaining
 *     a copy of this software and associated documentation files (the
 *     "Software"), to deal in the Software without restriction, including
 *     without limitation the rights to use, copy, modify, merge, publish,
 *     distribute, sublicense, and/or sell copies of the Software, and to
 *     permit persons to whom the Software is furnished to do so, subject to
 *     the following conditions:
 *
 *     The above copyright notice and this permission notice shall be
 *     included in all copies or substantial portions of the Software.
 *
 *     THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 *     EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 *     MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 *     NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 *     LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 *     OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 *     WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

/**
 * ConnectaBLE.JS
 * NodeJS Kinoma BLE Compatible API (v2 Compatible)
 *
 * Author: Shotaro Uchida <fantom@xmaker.mx>
 */

/* Mandatory utilities */
const Utils = require("./common/utils");
const Logger = Utils.Logger;

Logger.setDefaultBinding(msg => console.log(msg));

/* Mandatory BLE stack modules */
const GAP = require("../../bluetooth/core/gap");
const GAPADV = require("../../bluetooth/core/gapadvdata");
const GATT = require("../../bluetooth/core/gatt");
const GATTClient = require("../../bluetooth/gatt/client");
const GATTServer = require("../../bluetooth/gatt/server");
const BTUtils = require("../../bluetooth/core/btutils");
const BluetoothAddress = BTUtils.BluetoothAddress;
const MemoryBondingStorage = BTUtils.MemoryBondingStorage;
const UUID = BTUtils.UUID;

/* Transport */
const Transport = require("./nodeserial").Transport;

const DEFAULT_BONDING_FILE_NAME = "ble_bondings.json";

/* Default Scanning Parameters: General Discovery */
const DEFAULT_SCANNING_PARAMETERS = {
	observer: false,
	duplicatesFilter: true
};

/* Default Advertising Parameters: General Discoverable + Undirected Connectable */
const DEFAULT_ADVERTISING_PARAMETERS = {
	discoverable: true,
	conneactable: true
};

let logger = Logger.getLogger("API");

class MemoryClientConfigurationStorage {
	constructor() {
		this._ccConfigs = new Map();
	}
	readClientConfiguration(characteristic, connection) {
		let uuid = characteristic.uuid.toString();
		let configs = this._getClientConfigurations(connection);
		if (!configs.has(uuid)) {
			return 0x0000;
		}
		return configs.get(uuid);
	}
	writeClientConfiguration(characteristic, connection, value) {
		let uuid = characteristic.uuid.toString();
		let configs = this._ble._getClientConfigurations(connection);
		configs.set(uuid, value);
	}
	_getClientConfigurations(connection) {
		let address = connection.address;
		let key = address.toString() + "/" + address.typeString;
		if (!this._ccConfigs.has(key)) {
			this._ccConfigs.set(key, new Map());
		}
		return this._ccConfigs.get(key);
	}
	_removeClientConfigurations(connection) {
		let address = connection.address;
		let key = address.toString() + "/" + address.typeString;
		if (connection.securityInfo != null && connection.securityInfo.bonding && address.isIdentity()) {
			logger.debug("CCC will be kept");
			return;
		}
		this._ccConfigs.delete(key);
		logger.debug("CCC for " + key + " has been deleted");
	}
}

class BLE {
	constructor(clearBondings = false) {
		this._bondingStorage = new MemoryBondingStorage();
		this._ccStorage = new MemoryClientConfigurationStorage();
		this._gap = GAP.createLayer(this, this._bondingStorage);
		this._transport = new Transport();
		this._transport.delegate = this._gap.hci;
		this._server = new GATTServer.Profile();
		this._ready = false;
		/* Event Handlers */
		this._onReady = null;
		this._onConnected = null;
		this._onDiscovered = null;
		this._onPrivacyEnabled = null;
	}
	set onReady(cb) {
		this._onReady = cb;
	}
	set onConnected(cb) {
		this._onConnected = cb;
	}
	set onDiscovered(cb) {
		this._onDiscovered = cb;
	}
	set onPrivacyEnabled(cb) {
		this._onPrivacyEnabled = cb;
	}
	isReady() {
		return this._ready;
	}
	init(device, options = {}) {
		if (options.hasOwnProperty("logging")) {
			Logger.setOutputEnabled(options.logging);
			if ("loggers" in options) {
				for (let config of options.loggers) {
					let logger = Logger.getLogger(config.name);
					if (logger != null) {
						logger.loggingLevel = Logger.Level[config.level];
					}
				}
			}
		} else {
			Logger.setOutputEnabled(LOGGING_ENABLED);
		}
		this._transport.init(device);
		this._gap.init(this._transport, true);
	}
	get server() {
		return this._server;
	}
	startScanning(parameters = DEFAULT_SCANNING_PARAMETERS) {
		return this._gap.startScanning(parameters);
	}
	stopScanning() {
		return this._gap.stopScanning();
	}
	connect(address = null, parameters = null) {
		return this._gap.establishConnection(address, parameters);
	}
	startAdvertising(parameters = DEFAULT_ADVERTISING_PARAMETERS) {
		if (parameters.hasOwnProperty("advertising")) {
			parameters.advertising = GAPADV.serialize(parameters.advertising);
		}
		if (parameters.hasOwnProperty("scanResponse")) {
			parameters.scanResponse = GAPADV.serialize(parameters.scanResponse);
		}
		return this._gap.startAdvertising(parameters);
	}
	stopAdvertising() {
		return this._gap.stopAdvertising();
	}
	enablePrivacy() {
		return this._gap.enablePrivacyFeature(true);
	}
	disablePrivacy() {
		return this._gap.enablePrivacyFeature(false);
	}
	setWhiteList(addresses) {
		this._gap.setWhiteList(addresses);
	}
	/* GAP Callback */
	gapReady() {
		let p;
		if (!this._gap.hci.publicAddress.isValid()) {
			p = this._gap.setStaticAddress(BluetoothAddress.getByString("12:34:56:78:9A:BC"));
		} else {
			p = Promise.resolve(null);
		}
		p.then(() => {
			this._ready = true;
			if (this._onReady != null) {
				this._onReady();
			}
		});
	}
	/* GAP Callback */
	gapConnected(gapConnection) {
		if (this._onConnected != null) {
			let connection = new BLEConnection(this, gapConnection);
			this._onConnected(connection);
		}
	}
	/* GAP Callback */
	gapDiscovered(device) {
		if (this._onDiscovered != null) {
			if (device.hasOwnProperty("scanResponse")) {
				device.scanResponse = GAPADV.parse(device.scanResponse);
			} else if (!device.directed) {
				device.advertising = GAPADV.parse(device.advertising);
			}
			this._onDiscovered(device);
		}
	}
	/* GAP Callback */
	privacyEnabled(privateAddress) {
		if (this._onPrivacyEnabled != null) {
			this._onPrivacyEnabled(privateAddress);
		}
	}
}

class ATTBearer extends GATT.ATT.ATTBearer {
	constructor(ble, connection, database) {
		super(connection, database);
		this._ble = ble;
	}
	readClientConfiguration(characteristic, connection) {
		this._ble._ccStorage.readClientConfiguration(characteristic, connection);
	}
	writeClientConfiguration(characteristic, connection, value) {
		this._ble._ccStorage.writeClientConfiguration(characteristic, connection, value);
	}
}

class BLEConnection {
	constructor(ble, gapConnection) {
		this._ble = ble;	// XXX
		this._gapConn = gapConnection;
		this._gapConn.delegate = this;
		/* ATT & GATT */
		this._bearer = new ATTBearer(ble, gapConnection, ble.server.database);
		this._client = new GATTClient.Profile(this._bearer);
		/* Event Handlers */
		this._onPasskeyRequested = null;
		this._onAuthenticationCompleted = null;
		this._onAuthenticationFailed = null;
		this._onDisconnected = null;
		this._onUpdated = null;
	}
	set onPasskeyRequested(cb) {
		this._onPasskeyRequested = cb;
	}
	set onAuthenticationCompleted(cb) {
		this._onAuthenticationCompleted = cb;
	}
	set onAuthenticationFailed(cb) {
		this._onAuthenticationFailed = cb;
	}
	set onDisconnected(cb) {
		this._onDisconnected = cb;
	}
	set onUpdated(cb) {
		this._onUpdated = cb;
	}
	get client() {
		return this._client;
	}
	get handle() {
		return this._gapConn.handle;
	}
	get peripheral() {
		return this._gapConn.peripheral;
	}
	get parameters() {
		return this._gapConn.parameters;
	}
	get address() {
		return this._gapConn.address;
	}
	get identity() {
		return this._gapConn.identity;
	}
	get encrypted() {
		return this._gapConn.encrypted;
	}
	get securityInfo() {
		return this._gapConn.securityInfo;
	}
	isPeripheral() {
		return this._gapConn.peripheral;
	}
	updateConnection(parameters, l2cap) {
		this._gapConn.updateConnectionParameter(parameters, l2cap);
	}
	disconnect(reason) {
		this._gapConn.disconnect(reason);
	}
	startAuthentication() {
		this._gapConn.startAuthentication();
	}
	setSecurityParameter(parameter) {
		this._gapConn.setSecurityParameter(parameter);
	}
	passkeyEntry(passkey) {
		this._gapConn.passkeyEntry(passkey);
	}
	/* GAP Callback */
	passkeyRequested(input) {
		if (this._onPasskeyRequested != null) {
			this._onPasskeyRequested(input);
		}
	}
	/* GAP Callback */
	encryptionCompleted(securityChanged) {
		if (this._onAuthenticationCompleted != null) {
			this._onAuthenticationCompleted(securityChanged);
		}
	}
	/* GAP Callback */
	pairingFailed(reason) {
		if (this._onAuthenticationFailed != null) {
			this._onAuthenticationFailed(reason, true);
		}
	}
	/* GAP Callback */
	encryptionFailed(reason) {
		if (this._onAuthenticationFailed != null) {
			this._onAuthenticationFailed(reason, false);
		}
	}
	/* GAP Callback */
	disconnected(reason) {
		if (this._onDisconnected != null) {
			this._onDisconnected(reason);
		}
	}
	/* GAP Callback */
	connectionUpdated(parameters) {
		if (this._onUpdated != null) {
			this._onUpdated(parameters);
		}
	}
}

module.exports.GATT = GATT;
module.exports.GATT.Server = GATTServer;
module.exports.GATT.Client = GATTClient;
module.exports.UUID = UUID;
module.exports.Address = BluetoothAddress;
module.exports.BLE = BLE;