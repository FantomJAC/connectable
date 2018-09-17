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
 * NodeJS Transport Layer via node-bluetooth-hci-socket
 *
 * Author: Shotaro Uchida <fantom@xmaker.mx>
 */

const BluetoothHciSocket = require("bluetooth-hci-socket");
const UART = require("../../bluetooth/transport/uart");

const HCI_COMMAND_PKT = 0x01;
const HCI_ACLDATA_PKT = 0x02;
const HCI_EVENT_PKT = 0x04;

const TYPE_MASK = (1 << HCI_EVENT_PKT) | (1 << HCI_ACLDATA_PKT);
const EVENT_MASK1 = (1 << 0x05) | (1 << 0x08) | (1 << 0x0E) | (1 << 0x0F) | (1 << 0x13);
const EVENT_MASK2 = (1 << (0x3E - 32));

class Transport extends UART.Transport {
	constructor() {
		super({
			write: arrayBuffer => {
				this._socket.write(new Buffer(arrayBuffer));
			}
		});
		this._socket = new BluetoothHciSocket();
	}
	init(deviceId) {
		this._socket.on("data", this.dataReceived.bind(this));
		this._socket.bindUser(deviceId);
		this._socket.start();
	//	this.setSocketFilter();
	}
	setSocketFilter() {
		let filter = new Buffer(14);
		let opcode = 0;
		filter.writeUInt32LE(TYPE_MASK, 0);
		filter.writeUInt32LE(EVENT_MASK1, 4);
		filter.writeUInt32LE(EVENT_MASK2, 8);
		filter.writeUInt16LE(opcode, 12);
		logger.debug('setting filter to: ' + filter.toString('hex'));
		this._socket.setFilter(filter);
	}
	dataReceived(data) {
		super.receive(data, 0, data.length);
	}
}
exports.Transport = Transport;