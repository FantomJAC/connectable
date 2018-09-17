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
 * NodeJS Transport Layer via serialport
 *
 * Author: Shotaro Uchida <fantom@xmaker.mx>
 */

const SerialPort = require("serialport");
const UART = require("../../bluetooth/transport/uart");

class Transport extends UART.Transport {
	constructor() {
		super({
			write: arrayBuffer => {
				this._port.write(new Buffer(arrayBuffer));
			}
		});
		this._port = null;
	}
	init(portName) {
		this._port = new SerialPort(portName, {
			baudRate: 1000000
		});
		this._port.on("data", this.dataReceived.bind(this));
	}
	dataReceived(data) {
		super.receive(data, 0, data.length);
	}
}
exports.Transport = Transport;