var rbush = require('../rbush.js'),
	assert = require('assert');

describe('rbush', function () {
	var tree = new rbush();

	tree.load([[0, 0, 0, 0], [10, 10, 10, 10], [20, 20, 20, 20], [25, 0, 25, 0], [35, 10, 35, 10], [45, 20, 45, 20],
		[0, 25, 0, 25], [10, 35, 10, 35], [20, 45, 20, 45], [25, 25, 25, 25], [35, 35, 35, 35], [45, 45, 45, 45],
		[50, 0, 50, 0], [60, 10, 60, 10], [70, 20, 70, 20], [75, 0, 75, 0], [85, 10, 85, 10], [95, 20, 95, 20],
		[50, 25, 50, 25], [60, 35, 60, 35], [70, 45, 70, 45], [75, 25, 75, 25], [85, 35, 85, 35], [95, 45, 95, 45],
		[0, 50, 0, 50], [10, 60, 10, 60], [20, 70, 20, 70], [25, 50, 25, 50], [35, 60, 35, 60], [45, 70, 45, 70],
		[0, 75, 0, 75], [10, 85, 10, 85],  [20, 95, 20, 95], [25, 75, 25, 75], [35, 85, 35, 85], [45, 95, 45, 95],
		[50, 50, 50, 50], [60, 60, 60, 60], [70, 70, 70, 70], [75, 50, 75, 50], [85, 60, 85, 60], [95, 70, 95, 70],
		[50, 75, 50, 75], [60, 85, 60, 85], [70, 95, 70, 95], [75, 75, 75, 75], [85, 85, 85, 85], [95, 95, 95, 95]]);

	describe('search', function () {
		it('finds points given a bbox', function () {
			console.log(JSON.stringify(tree.data));

			var result = tree.search([40, 20, 80, 70]);

			var sorted = [];

			for (var i = 0; i < result.length; i++) {
				sorted[i] = result[i][0] + ',' + result[i][1];
			}

			sorted.sort();

			assert.deepEqual(sorted,
				['70,20', '75,25', '45,45', '50,50', '60,60', '70,70',
				 '45,20', '45,70', '75,50', '50,25', '60,35', '70,45'].sort());
		});
	});
});