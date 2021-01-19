#!/usr/bin/env node

"use strict"

const fs = require('fs');
const {resolve} = require('path');
const AdmZip = require('adm-zip');
const { DOMParser } = require('xmldom');
const xpath = require('xpath');
const select = xpath.useNamespaces({a:'http://schemas.openxmlformats.org/spreadsheetml/2006/main'});



const dirSrc = resolve(__dirname, '../data/0_original/'); // folder with all XLSX files 
const dirDst = resolve(__dirname, '../data/1_parsed/');  // folder with all resulting JSON files



let files = fs.readdirSync(dirSrc);
files.forEach(filename => {
	if (!/^impfquotenmonitoring-202.*\.xlsx$/.test(filename)) return;

	// full name of source XLSX file and resulting JSON file
	let fullnameSrc = resolve(dirSrc, filename);
	let fullnameDst = resolve(dirDst, filename.replace(/\.xlsx$/i, '.json'));

	// ignore, when JSON file already exists
	if (fs.existsSync(fullnameDst)) return;

	console.log('parse '+filename);

	// parse excel file
	let excel = parseExcel(fullnameSrc);

	// extract data
	let data  = extractData(excel);

	// save data structure as JSON
	fs.writeFileSync(fullnameDst, JSON.stringify(data, null, '\t'));
})


function parseExcel(filename) {
	const letters = Object.fromEntries(',A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z'.split(',').map((c,i) => [c,i]));

	let excel = {sheets: []}

	// unzip excel file
	let zip = new AdmZip(filename);

	// find the 4 XML files we need
	let workbook, sheets = new Map(), strings, match;
	zip.getEntries().forEach(e => {
		if (e.entryName.endsWith('xl/workbook.xml')) return workbook = p(e); // get workbook
		if (match = e.entryName.match(/xl\/worksheets\/sheet(\d+)\.xml$/)) {
			sheets.set(match[1], {node:p(e)});
			return
		}
		if (e.entryName.endsWith('xl/sharedStrings.xml')) { // get shared strings
			strings = p(e);
			strings = select('//a:si', strings).map(string => 
				select('.//a:t[not(ancestor::a:rPh)]', string).map(node => node.textContent).join('')
			)
			return
		}

		function p(e) {
			return new DOMParser().parseFromString(e.getData().toString('utf8'));
		}
	})

	select('/a:workbook/a:sheets/a:sheet', workbook).forEach(node => {
		let id = node.getAttribute('r:id').match(/^rId(\d+)$/)[1];
		let name = node.getAttribute('name');
		sheets.get(id).name = name;
	})

	sheets = Array.from(sheets.values());
	sheets.forEach(sheet => {
		sheet.cells = extractCells(sheet.node);
		delete sheet.node;
	})


	console.dir(sheets, {depth:6});
	process.exit();

	function extractCells(sheet) {
		let cells = [];
		select('/a:worksheet/a:sheetData/a:row/a:c', sheet).forEach(node => {
			let cell = parseCell(node);

			if (!cells[cell.row]) cells[cell.row] = [];
			cells[cell.row][cell.col] = cell.value;
		});

		// fix merged cells
		select('/a:worksheet/a:mergeCells/a:mergeCell', sheet).forEach(node => {
			let range = node.getAttribute('ref').split(':').map(parseAddress);
			let colMin = Math.min(range[0].col, range[1].col);
			let colMax = Math.max(range[0].col, range[1].col);
			let rowMin = Math.min(range[0].row, range[1].row);
			let rowMax = Math.max(range[0].row, range[1].row);

			let v = cells[rowMin][colMin];
			for (let row = rowMin; row <= rowMax; row++) {
				for (let col = colMin; col <= colMax; col++) {
					cells[row][col] = v;
				}
			}
		});
		return cells;

		function parseCell(node) {
			let {col, row} = parseAddress(node.getAttribute('r'));
			let value = (select('a:v', node, 1) || {textContent: ''}).textContent;
			let type = node.getAttribute('t') || '';

			switch (type) {
				case 's': value = strings[parseInt(value, 10)]; break;
				case '': value = (value === '') ? null : parseFloat(value); break;
				default: throw Error('unknown cell type '+type);
			}

			return {col, row, value};
		}

		function parseAddress(range) {
			range = range.split(/([0-9]+)/);
			return {
				col: colToInt(range[0])-1,
				row: parseInt(range[1], 10)-1,
			}

			function colToInt(col) {
				return col.trim().split('').reduce((n, c) => n*26 +letters[c], 0);
			}
		}
	}
}




/*
const letters = Object.fromEntries(',A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z'.split(',').map((c,i) => [c,i]));
// Excel column headers
const _excelColHeaders = [
	{name:'impfungen_kumulativ',          text:'Impfungen kumulativ'},
	{name:'differenz_zum_vortag',         text:'Differenz zum Vortag'},
	{name:'impfungen_pro_1000_einwohner', text:'Impfungen pro 1.000 Einwohner', optional:true},
	{name:'indikation_nach_alter',        text:'Indikation nach Alter'},
	{name:'berufliche_indikation',        text:'Berufliche Indikation'},
	{name:'medizinische_indikation',      text:'Medizinische Indikation'},
	{name:'pflegeheimbewohnerin',         text:'Pflegeheim-bewohnerIn'},
];
// Excel row headers
const _excelRowHeaders = [
	{name:'BW', text:'Baden-Württemberg'},
	{name:'BY', text:'Bayern'},
	{name:'BE', text:'Berlin'},
	{name:'BB', text:'Brandenburg'},
	{name:'HB', text:'Bremen'},
	{name:'HH', text:'Hamburg'},
	{name:'HE', text:'Hessen'},
	{name:'MV', text:'Mecklenburg-Vorpommern'},
	{name:'NI', text:'Niedersachsen'},
	{name:'NW', text:'Nordrhein-Westfalen'},
	{name:'RP', text:'Rheinland-Pfalz'},
	{name:'SL', text:'Saarland'},
	{name:'SN', text:'Sachsen'},
	{name:'ST', text:'Sachsen-Anhalt'},
	{name:'SH', text:'Schleswig-Holstein'},
	{name:'TH', text:'Thüringen'},
	{name:'DE', text:'Gesamt'},

	{text:'Anmerkung zu den Indikationen: Es können mehrere Indikationen je geimpfter Person vorliegen.', ignore:true},
	{text:'einschl. Korrekturmeldung vom 27.12.20', ignore:true},
	{text:'undefined', ignore:true},
	{text:'In Sachsen-Anhalt wurde bereits am 26.12.2020 mit den Impfungen begonnen.', ignore:true},
	{text:'In einigen Bundesländern werden nicht alle der in der Tabelle aufgeführten Indikationen einzeln ausgewiesen.', ignore:true},
	{text:'in einigen Bundesländern werden nicht alle der in der Tabelle aufgeführten Indikationen einzeln ausgewiesen', ignore:true},
	{text:'Anmerkung zu den Indikationen: es können mehrere Indikationen je geimpfter Person vorliegen', ignore:true},
];



// scan XLSX folder
let todos = [];
fs.readdirSync(dirSrc).forEach(filename => {
	// ignore anything else than impfquotenmonitoring
	if (!/^impfquotenmonitoring-202.*\.xlsx$/.test(filename)) return;

	// full name of source XLSX file and resulting JSON file
	let fullnameSrc = resolve(dirSrc, filename);
	let fullnameDst = resolve(dirDst, filename.replace(/\.xlsx$/i, '.json'));

	// ignore, when JSON file already exists
	if (fs.existsSync(fullnameDst)) return;

	console.log('parse '+filename);

	// unzip excel file
	let zip = new AdmZip(fullnameSrc);

	// find the 4 XML files we need
	let workbook, sheetFront, sheetData, strings;
	zip.getEntries().forEach(e => {
		if (e.entryName.endsWith('xl/workbook.xml')) return workbook = p(e); // get workbook
		if (e.entryName.endsWith('xl/worksheets/sheet1.xml')) return sheetFront = p(e); // get front sheet
		if (e.entryName.endsWith('xl/worksheets/sheet2.xml')) return sheetData = p(e); // get data sheet
		if (e.entryName.endsWith('xl/sharedStrings.xml')) return strings = p(e); // get shared strings

		function p(e) {
			return new DOMParser().parseFromString(e.getData().toString('utf8'));
		}
	})
	
	// extract shared strings
	strings = select('//a:si', strings).map(string => select('.//a:t[not(ancestor::a:rPh)]', string).map(node => node.textContent).join(''));

	// extract front sheet name
	let sheetDataName = false;
	select('/a:workbook/a:sheets/a:sheet', workbook).forEach(node => {
		if (node.getAttribute('r:id') === 'rId2') sheetDataName = node.getAttribute('name');
	})

	// extract front sheet cell content
	let sheetFrontCells = extractCells(sheetFront);
	let date = parseDate(filename, sheetDataName, sheetFrontCells);

	// extract data sheet cell content
	let sheetDataCells = extractCells(sheetData);

	let colOffset = 0;
	let rowOffset = 0;
	if (date >= '2021-01-07') colOffset = 1;
	
	// check headers
	let excelColHeaders = prepareHeaderDefinition(_excelColHeaders, colOffset, sheetDataCells[rowOffset]);
	let excelRowHeaders = prepareHeaderDefinition(_excelRowHeaders, rowOffset, sheetDataCells.map(r => r[colOffset]));

	// read data from Excel file to data structure
	let data = {date, states:{}};
	excelRowHeaders.forEach(r => {
		let obj = {
			code:r.name,
			title:r.text,
		}
		excelColHeaders.forEach(c => obj[c.name] = sheetDataCells[r.index][c.index])
		if (r.name === 'DE') return data.germany = obj;
		data.states[r.name] = obj;
	})

	// save data structure as JSON
	fs.writeFileSync(fullnameDst, JSON.stringify(data, null, '\t'));



	function extractCells(sheet) {
		let cells = [];
		select('/a:worksheet/a:sheetData/a:row/a:c', sheet).forEach(node => {
			let cell = parseCell(node);

			if (!cells[cell.row]) cells[cell.row] = [];
			cells[cell.row][cell.col] = cell.value;
		});
		return cells;

		function parseCell(node) {
			let range = node.getAttribute('r').split(/([0-9]+)/);
			let col = colToInt(range[0])-1;
			let row = parseInt(range[1])-1;
			let value = (select('a:v', node, 1) || {textContent: ''}).textContent;
			let type = node.getAttribute('t') || '';

			switch (type) {
				case 's': value = strings[parseInt(value, 10)]; break;
				case '': value = parseFloat(value); break;
				default: throw Error('unknown cell type '+type);
			}

			return {col, row, value};

			function colToInt(col) {
				return col.trim().split('').reduce((n, c) => n*26 +letters[c], 0);
			}
		}
	}

	function prepareHeaderDefinition(_def, offset, data) {
		let def = _def.map(e => {
			let entry = Object.assign({}, e);
			entry.use = false;
			return entry;
		});

		for (let i = 1+offset; i < data.length; i++) {
			let value = (''+data[i]).replace(/\*+/g,'').trim();
			let entry = def.find(e => e.text === value);
			
			if (!entry) throw Error('"'+value+'" ('+JSON.stringify(data)+') not found in '+JSON.stringify(def));
			entry.index = i;

			if (!entry.ignore && entry.use) throw Error('"'+value+'" ('+JSON.stringify(data)+') already in use '+JSON.stringify(def));
			entry.use = true;
		}

		def = def.filter(entry => {
			if (entry.ignore) return false;
			if (entry.use) return true;
			if (entry.optional) return false;
			throw Error(JSON.stringify(entry));
		})

		return def;
	}
})


function parseDate(filename, sheetName, cells) {
	// parses date and returns it as string like "2021-01-01 12:30"
	let match;
	let rows = cells.map(r => r.join('\t'));
	let dateStrings = [rows[2], rows[5], sheetName].join('\t');

	if (match = dateStrings.match(/^\tDatenstand: (\d\d)\.(\d\d)\.(\d\d\d\d), (\d\d:\d\d) Uhr\t/)) {
		return match[3]+'-'+match[2]+'-'+match[1]+' '+match[4];
	}

	if (match = dateStrings.match(/^\tDatenstand: 28\.12\.2020, 08:00 Uhr\t(44\d\d\d)\t(\d\d:\d\d) Uhr/)) {
		let d = (parseFloat(match[1])-25568.5)*86400000;
		d = (new Date(d)).toISOString();
		d = d.substr(0,10)+' '+match[2];
		return d;
	}

	if (dateStrings.startsWith('Datenstand: 28.12.2020, 08:00 Uhr\t44200\t12:00 Uhr')) return '2021-01-04 12:00';

	if (match = dateStrings.match(/^Datenstand: (\d\d)\.(\d\d)\.(\d\d\d\d), (\d\d:\d\d) Uhr\tNaN\tNaN\tNaN\t/)) {
		return match[3]+'-'+match[2]+'-'+match[1]+' '+match[4];
	}

	console.log(filename, dateStrings);

	throw Error('Can not parse date');
}
*/
