define(function(require) {
	var $ = require('jquery'),
		_ = require('lodash'),
		monster = require('monster'),
		Chart = require('chart');

	var app = {

		requests: {
			'google.geocode.address': {
				apiRoot: '//maps.googleapis.com/',
				url: 'maps/api/geocode/json?address={zipCode}',
				verb: 'GET',
				generateError: false,
				removeHeaders: [
					'X-Kazoo-Cluster-ID',
					'X-Auth-Token',
					'Content-Type'
				]
			}
		},

		subscribe: {
			'voip.myOffice.render': 'myOfficeRender',
			'auth.continueTrial': 'myOfficeWalkthroughRender',
			'myaccount.closed': 'myOfficeAfterMyaccountClosed'
		},

		chartColors: [
			'#B588B9', // Purple ~ Mauve
			'#698BF7', // Purple ~ Dark Blue
			'#009AD6', // Blue
			'#6CC5E9', // Light Blue
			'#719B11', // Dark Green
			'#BDE55F', // Light Green
			'#F1E87C', // Pale Yellow
			'#EF8F25', // Orange
			'#6F7C7D'  // Grey
		],

		/* My Office */
		myOfficeRender: function(args) {
			var self = this,
				parent = args.parent || $('.right-content'),
				callback = args.callback;

			self.myOfficeLoadData(function(myOfficeData) {
				var dataTemplate = {
						isCnamEnabled: monster.util.isNumberFeatureEnabled('cnam'),
						account: myOfficeData.account,
						totalUsers: myOfficeData.users.length,
						totalDevices: myOfficeData.devices.length,
						unregisteredDevices: myOfficeData.unregisteredDevices,
						totalNumbers: _.size(myOfficeData.numbers),
						totalConferences: myOfficeData.totalConferences,
						totalChannels: myOfficeData.totalChannels,
						mainNumbers: myOfficeData.mainNumbers || [],
						confNumbers: myOfficeData.confNumbers || [],
						faxingNumbers: myOfficeData.faxingNumbers || [],
						faxNumbers: myOfficeData.faxNumbers || [],
						topMessage: myOfficeData.topMessage,
						devicesList: _
							.chain(myOfficeData.devicesData)
							.toArray()
							.orderBy('count', 'desc')
							.value(),
						usersList: _
							.chain(myOfficeData.usersData)
							.toArray()
							.orderBy('count', 'desc')
							.value(),
						assignedNumbersList: _
							.chain(myOfficeData.assignedNumbersData)
							.toArray()
							.orderBy('count', 'desc')
							.value(),
						// numberTypesList: _
						// 	.chain(myOfficeData.numberTypesData)
						// 	.toArray()
						// 	.orderBy('count', 'desc')
						// 	.value(),
						classifiedNumbers: myOfficeData.classifiedNumbers,
						directoryUsers: myOfficeData.directory.users && myOfficeData.directory.users.length || 0,
						directoryLink: myOfficeData.directoryLink,
						showUserTypes: self.appFlags.global.showUserTypes
					},
					template = $(self.getTemplate({
						name: 'layout',
						data: dataTemplate,
						submodule: 'myOffice'
					})),
					$devicesCanvas = template.find('#dashboard_devices_chart'),
					$assignedNumbersCanvas = template.find('#dashboard_assigned_numbers_chart'),
					$classifiedNumbersCanvas = template.find('#dashboard_number_types_chart'),
					emptyDataSet = [
						{
							count: 1,
							color: '#ddd'
						}
					],
					devicesDataSet = _.chain(myOfficeData.devicesData).omit('totalCount').sortBy('count').value(),
					usersDataSet = _.chain(myOfficeData.usersData).omit('totalCount').sortBy('count').value(),
					assignedNumbersDataSet = _.chain(myOfficeData.assignedNumbersData).omit('totalCount').sortBy('count').value(),
					classifiedNumbersDataSet = _.chain(myOfficeData.classifiedNumbers).sortBy('count').value(),
					createDoughnutCanvas = function createDoughnutCanvas($target) {
						var args = Array.prototype.slice.call(arguments),
							datasets;

						args.splice(0, 1);

						datasets = args;

						return new Chart($target, $.extend(true, {
							type: 'doughnut',
							options: {
								legend: {
									display: false
								},
								tooltips: {
									enabled: false
								},
								animation: {
									easing: 'easeOutCirc',
									animateScale: true
								},
								events: []
							}
						}, {
							data: {
								datasets: datasets
							}
						}));
					};

				devicesDataSet = _.isEmpty(devicesDataSet) ? emptyDataSet : devicesDataSet;
				usersDataSet = _.isEmpty(usersDataSet) ? emptyDataSet : usersDataSet;
				assignedNumbersDataSet = _.isEmpty(assignedNumbersDataSet) ? emptyDataSet : assignedNumbersDataSet;
				classifiedNumbersDataSet = _.isEmpty(classifiedNumbersDataSet) ? emptyDataSet : classifiedNumbersDataSet;

				// Trick to adjust the vertical positioning of the number types legend
				if (myOfficeData.classifiedNumbers.length <= 3) {
					template.find('.number-types-legend').addClass('size-' + myOfficeData.classifiedNumbers.length);
				}

				self.myOfficeBindEvents({
					parent: parent,
					template: template,
					myOfficeData: myOfficeData
				});

				parent
					.empty()
					.append(template);

				createDoughnutCanvas($devicesCanvas, {
					data: _.map(devicesDataSet, 'count'),
					backgroundColor: _.map(devicesDataSet, 'color'),
					borderWidth: 0
				});

				createDoughnutCanvas($assignedNumbersCanvas, {
					data: _.map(assignedNumbersDataSet, 'count'),
					backgroundColor: _.map(assignedNumbersDataSet, 'color'),
					borderWidth: 0
				});

				createDoughnutCanvas($classifiedNumbersCanvas, {
					data: _.map(classifiedNumbersDataSet, 'count'),
					backgroundColor: _.map(classifiedNumbersDataSet, 'color'),
					borderWidth: 0
				});

				if (dataTemplate.showUserTypes) {
					var $usersCanvas = template.find('#dashboard_user_type_chart');

					createDoughnutCanvas($usersCanvas, {
						data: _.map(usersDataSet, 'count'),
						backgroundColor: _.map(usersDataSet, 'color'),
						borderWidth: 0
					});
				}

				self.myOfficeCheckWalkthrough();

				callback && callback();
			});
		},

		// we check if we have to display the walkthrough:
		// first make sure it's not a trial, then
		// only show it if we've already shown the walkthrough in myaccount
		myOfficeCheckWalkthrough: function() {
			var self = this;

			if (!monster.apps.auth.currentAccount.hasOwnProperty('trial_time_left')) {
				monster.pub('myaccount.hasToShowWalkthrough', function(response) {
					if (response === false) {
						self.myOfficeWalkthroughRender();
					}
				});
			}
		},

		myOfficeAfterMyaccountClosed: function() {
			var self = this;

			// If it's not a trial, we show the Walkthrough the first time
			// because if it's a trial, myOfficeWalkthroughRender will be called by another event
			if (!monster.apps.auth.currentAccount.hasOwnProperty('trial_time_left')) {
				self.myOfficeWalkthroughRender();
			}
		},

		myOfficeCreateMainVMBoxIfMissing: function(callback) {
			var self = this;

			self.myOfficeHasMainVMBox(
				function(vmbox) {
					callback(vmbox);
				},
				function() {
					self.myOfficeCreateMainVMBox(function(vmbox) {
						callback(vmbox);
					});
				}
			);
		},

		myOfficeCreateMainVMBox: function(callback) {
			var self = this,
				vmboxData = {
					mailbox: '0',
					type: 'mainVMBox',
					name: self.i18n.active().myOffice.mainVMBoxName,
					delete_after_notify: true
				};

			self.callApi({
				resource: 'voicemail.create',
				data: {
					accountId: self.accountId,
					data: vmboxData
				},
				success: function(vmbox) {
					callback && callback(vmbox.data);
				}
			});
		},

		myOfficeHasMainVMBox: function(hasVMBoxCallback, noVMBoxCallback) {
			var self = this;

			self.callApi({
				resource: 'voicemail.list',
				data: {
					accountId: self.accountId,
					filters: {
						filter_type: 'mainVMBox'
					}
				},
				success: function(vmboxes) {
					if (vmboxes.data.length > 0) {
						hasVMBoxCallback && hasVMBoxCallback(vmboxes[0]);
					} else {
						noVMBoxCallback && noVMBoxCallback();
					}
				}
			});
		},

		myOfficeLoadData: function(callback) {
			var self = this;

			monster.parallel({
				account: function(parallelCallback) {
					self.callApi({
						resource: 'account.get',
						data: {
							accountId: self.accountId
						},
						success: function(dataAccount) {
							parallelCallback && parallelCallback(null, dataAccount.data);
						}
					});
				},
				mainVoicemailBox: function(parallelCallback) {
					self.myOfficeCreateMainVMBoxIfMissing(function(vmbox) {
						parallelCallback(null, vmbox);
					});
				},
				users: function(parallelCallback) {
					self.callApi({
						resource: 'user.list',
						data: {
							accountId: self.accountId,
							filters: {
								paginate: 'false'
							}
						},
						success: function(dataUsers) {
							parallelCallback && parallelCallback(null, dataUsers.data);
						}
					});
				},
				devices: function(parallelCallback) {
					self.callApi({
						resource: 'device.list',
						data: {
							accountId: self.accountId,
							filters: {
								paginate: 'false'
							}
						},
						success: function(data) {
							parallelCallback && parallelCallback(null, data.data);
						}
					});
				},
				devicesStatus: function(parallelCallback) {
					self.callApi({
						resource: 'device.getStatus',
						data: {
							accountId: self.accountId,
							filters: {
								paginate: 'false'
							}
						},
						success: function(data) {
							parallelCallback && parallelCallback(null, data.data);
						}
					});
				},
				numbers: function(parallelCallback) {
					self.callApi({
						resource: 'numbers.list',
						data: {
							accountId: self.accountId,
							filters: {
								paginate: 'false'
							}
						},
						success: function(data) {
							parallelCallback && parallelCallback(null, data.data.numbers);
						}
					});
				},
				channels: function(parallelCallback) {
					self.callApi({
						resource: 'channel.list',
						data: {
							accountId: self.accountId,
							filters: {
								paginate: 'false'
							}
						},
						success: function(data) {
							parallelCallback && parallelCallback(null, data.data);
						}
					});
				},
				callflows: function(parallelCallback) {
					self.callApi({
						resource: 'callflow.list',
						data: {
							filters: {
								has_type: 'type',
								paginate: 'false'
							},
							accountId: self.accountId
						},
						success: function(data) {
							parallelCallback && parallelCallback(null, data.data);
						}
					});
				},
				classifiers: function(parallelCallback) {
					self.callApi({
						resource: 'numbers.listClassifiers',
						data: {
							accountId: self.accountId
						},
						success: function(data) {
							parallelCallback && parallelCallback(null, data.data);
						}
					});
				},
				directory: function(parallelCallback) {
					self.callApi({
						resource: 'directory.list',
						data: {
							accountId: self.accountId
						},
						success: function(data, status) {
							var mainDirectory = _.find(data.data, function(val) {
								return val.name === 'SmartPBX Directory';
							});
							if (mainDirectory) {
								self.callApi({
									resource: 'directory.get',
									data: {
										accountId: self.accountId,
										directoryId: mainDirectory.id,
										filters: {
											paginate: false
										}
									},
									success: function(data, status) {
										parallelCallback && parallelCallback(null, data.data);
									},
									error: function(data, status) {
										parallelCallback && parallelCallback(null, {});
									}
								});
							} else {
								parallelCallback && parallelCallback(null, {});
							}
						},
						error: function(data, status) {
							parallelCallback && parallelCallback(null, {});
						}
					});
				}
			}, function(error, results) {
				callback && callback(self.myOfficeFormatData(results));
			});
		},

		myOfficeFormatData: function(data) {
			var self = this,
				devices = {
					sip_device: {
						label: self.i18n.active().devices.types.sip_device,
						count: 0,
						color: self.chartColors[5]
					},
					cellphone: {
						label: self.i18n.active().devices.types.cellphone,
						count: 0,
						color: self.chartColors[3]
					},
					smartphone: {
						label: self.i18n.active().devices.types.smartphone,
						count: 0,
						color: self.chartColors[2]
					},
					mobile: {
						label: self.i18n.active().devices.types.mobile,
						count: 0,
						color: self.chartColors[1]
					},
					softphone: {
						label: self.i18n.active().devices.types.softphone,
						count: 0,
						color: self.chartColors[0]
					},
					landline: {
						label: self.i18n.active().devices.types.landline,
						count: 0,
						color: self.chartColors[6]
					},
					fax: {
						label: self.i18n.active().devices.types.fax,
						count: 0,
						color: self.chartColors[7]
					},
					ata: {
						label: self.i18n.active().devices.types.ata,
						count: 0,
						color: self.chartColors[8]
					},
					sip_uri: {
						label: self.i18n.active().devices.types.sip_uri,
						count: 0,
						color: self.chartColors[4]
					},
					totalCount: 0
				},
				assignedNumbers = {
					spare: {
						label: self.i18n.active().myOffice.numberChartLegend.spare,
						count: 0,
						color: self.chartColors[8]
					},
					assigned: {
						label: self.i18n.active().myOffice.numberChartLegend.assigned,
						count: 0,
						color: self.chartColors[3]
					},
					totalCount: 0
				},
				users = {
					_unassigned: {
						label: self.i18n.active().myOffice.userChartLegend.none,
						count: 0,
						color: self.chartColors[8]
					}
				},
				// numberTypes = {
				// 	local: {
				// 		label: self.i18n.active().myOffice.numberChartLegend.local,
				// 		count: 0,
				// 		color: '#6cc5e9'
				// 	},
				// 	tollfree: {
				// 		label: self.i18n.active().myOffice.numberChartLegend.tollfree,
				// 		count: 0,
				// 		color: '#bde55f'
				// 	},
				// 	international: {
				// 		label: self.i18n.active().myOffice.numberChartLegend.international,
				// 		count: 0,
				// 		color: '#b588b9'
				// 	}
				// },
				totalConferences = 0,
				channelsArray = [],
				classifierRegexes = {},
				classifiedNumbers = {},
				registeredDevices = _.map(data.devicesStatus, function(device) { return device.device_id; }),
				unregisteredDevices = 0;

			if (self.appFlags.global.showUserTypes) {
				var i = 7; // start from the end of chart colors so all the charts don't look the same
				_.each(self.appFlags.global.servicePlansRole, function(role, id) {
					users[id] = {
						label: role.name,
						count: 0,
						color: self.chartColors[i >= 1 ? i-- : 8]
					};
				});
			}

			_.each(data.numbers, function(numData, num) {
				_.find(data.classifiers, function(classifier, classifierKey) {
					if (!(classifierKey in classifierRegexes)) {
						classifierRegexes[classifierKey] = new RegExp(classifier.regex);
					}
					if (classifierRegexes[classifierKey].test(num)) {
						if (classifierKey in classifiedNumbers) {
							classifiedNumbers[classifierKey] ++;
						} else {
							classifiedNumbers[classifierKey] = 1;
						}
						return true;
					} else {
						return false;
					}
				});
			});

			data.classifiedNumbers = _.map(classifiedNumbers, function(val, key) {
				return {
					key: key,
					label: key in data.classifiers ? data.classifiers[key].friendly_name : key,
					count: val
				};
			}).sort(function(a, b) { return b.count - a.count; });

			var maxLength = self.chartColors.length;
			if (data.classifiedNumbers.length > maxLength) {
				data.classifiedNumbers[maxLength - 1].key = 'merged_others';
				data.classifiedNumbers[maxLength - 1].label = 'Others';
				while (data.classifiedNumbers.length > maxLength) {
					data.classifiedNumbers[maxLength - 1].count += data.classifiedNumbers.pop().count;
				}
			}

			_.each(data.classifiedNumbers, function(val, key) {
				val.color = self.chartColors[key];
			});

			_.each(data.devices, function(val) {
				if (val.device_type in devices) {
					devices[val.device_type].count++;
					devices.totalCount++;

					if (val.enabled === false || (['sip_device', 'smartphone', 'softphone', 'fax', 'ata'].indexOf(val.device_type) >= 0 && registeredDevices.indexOf(val.id) < 0)) {
						unregisteredDevices++;
					}
				} else {
					console.log('Unknown device type: ' + val.device_type);
				}
			});

			_.each(data.numbers, function(val) {
				if ('used_by' in val && val.used_by.length > 0) {
					assignedNumbers.assigned.count++;
				} else {
					assignedNumbers.spare.count++;
				}
				assignedNumbers.totalCount++;

				//TODO: Find out the number type and increment the right category
				// numberTypes["local"].count++;
			});

			_.each(data.users, function(val) {
				if (self.appFlags.global.showUserTypes
					&& val.hasOwnProperty('service')
					&& val.service.hasOwnProperty('plans')
					&& !_.isEmpty(val.service.plans)) {
					var planId;

					for (var key in val.service.plans) {
						if (val.service.plans.hasOwnProperty(key)) {
							planId = key;
							break;
						}
					}

					if (users.hasOwnProperty(planId)) {
						users[planId].count += 1;
					} else {
						users._unassigned.count += 1;
					}
				} else {
					users._unassigned.count++;
				}

				if (val.features.indexOf('conferencing') >= 0) {
					totalConferences++;
				}
			});

			_.each(data.callflows, function(val) {
				var numberArrayName = '';
				if (val.type === 'main' && val.name === 'MainCallflow') {
					numberArrayName = 'mainNumbers';
				} else if (val.type === 'conference' && val.name === 'MainConference') {
					numberArrayName = 'confNumbers';
				} else if (val.type === 'faxing' && val.name === 'MainFaxing') {
					numberArrayName = 'faxingNumbers';
				}

				if (numberArrayName.length > 0) {
					if (!(numberArrayName in data)) { data[numberArrayName] = []; }
					_.each(val.numbers, function(num) {
						if (['0', 'undefined', 'undefinedconf', 'undefinedfaxing', 'undefinedMainNumber'].indexOf(num) < 0) {
							var number = {
								number: num
							};
							if (num in data.numbers) {
								number.features = data.numbers[num].features;
							}
							data[numberArrayName].push(number);
						}
					});
				}
			});

			_.each(data.channels, function(val) {
				if (channelsArray.indexOf(val.bridge_id) < 0) {
					channelsArray.push(val.bridge_id);
				}
			});

			if (data.mainNumbers && data.mainNumbers.length > 0) {
				var hasValidCallerId = monster.util.isNumberFeatureEnabled('cnam') === false || data.account.hasOwnProperty('caller_id') && data.account.caller_id.hasOwnProperty('emergency') && data.account.caller_id.emergency.hasOwnProperty('number') && data.numbers.hasOwnProperty(data.account.caller_id.emergency.number),
					hasValidE911 = monster.util.isNumberFeatureEnabled('e911') === false || data.account.hasOwnProperty('caller_id') && data.account.caller_id.hasOwnProperty('emergency') && data.account.caller_id.emergency.hasOwnProperty('number') && data.numbers.hasOwnProperty(data.account.caller_id.emergency.number) && data.numbers[data.account.caller_id.emergency.number].features.indexOf('e911') >= 0;

				if (!hasValidCallerId && !hasValidE911) {
					data.topMessage = {
						cssClass: 'btn-danger',
						message: self.i18n.active().myOffice.missingCnamE911Message,
						action: 'checkMissingE911'
					};
				} else if (!hasValidCallerId) {
					data.topMessage = {
						cssClass: 'btn-danger',
						message: self.i18n.active().myOffice.missingCnamMessage
					};
				} else if (!hasValidE911) {
					data.topMessage = {
						cssClass: 'btn-danger',
						message: self.i18n.active().myOffice.missingE911Message,
						action: 'checkMissingE911'
					};
				}
			}

			data.totalChannels = channelsArray.length;
			data.devicesData = devices;
			data.usersData = users;
			data.assignedNumbersData = assignedNumbers;
			// data.numberTypesData = numberTypes;
			data.totalConferences = totalConferences;
			data.unregisteredDevices = unregisteredDevices;

			if (data.directory && data.directory.id) {
				data.directoryLink = self.apiUrl + 'accounts/' + self.accountId + '/directories/' + data.directory.id + '?accept=pdf&paginate=false&auth_token=' + self.getAuthToken();
			}

			return data;
		},

		myOfficeBindEvents: function(args) {
			var self = this,
				parent = args.parent,
				template = args.template,
				myOfficeData = args.myOfficeData;

			template.find('.link-box').on('click', function(e) {
				var $this = $(this),
					category = $this.data('category'),
					subcategory = $this.data('subcategory'),
					actionType = $this.data('action');

				$('.category').removeClass('active');
				switch (category) {
					case 'users':
						$('.category#users').addClass('active');
						monster.pub('voip.users.render', { parent: parent });
						break;
					case 'devices':
						$('.category#devices').addClass('active');
						monster.pub('voip.devices.render', { parent: parent });
						break;
					case 'numbers':
						$('.category#numbers').addClass('active');
						monster.pub('voip.numbers.render', { parent: parent });
						break;
					case 'strategy':
						$('.category#strategy').addClass('active');
						monster.pub('voip.strategy.render', {
							parent: parent,
							openElement: subcategory,
							action: {
								type: actionType
							}
						});
						break;
				}
			});

			template.find('.header-link.music-on-hold').on('click', function(e) {
				e.preventDefault();
				self.myOfficeRenderMusicOnHoldPopup({
					account: myOfficeData.account
				});
			});

			if (monster.util.isNumberFeatureEnabled('cnam')) {
				template.find('.header-link.caller-id:not(.disabled)').on('click', function(e) {
					e.preventDefault();
					self.myOfficeRenderCallerIdPopup({
						parent: parent,
						myOfficeData: myOfficeData
					});
				});
			}

			template.find('.header-link.caller-id.disabled').on('click', function(e) {
				monster.ui.alert(self.i18n.active().myOffice.missingMainNumberForCallerId);
			});

			monster.ui.tooltips(template);
		},

		myOfficeRenderMusicOnHoldPopup: function(args) {
			var self = this,
				account = args.account,
				silenceMediaId = 'silence_stream://300000';

			self.myOfficeListMedias(function(medias) {
				var templateData = {
						showMediaUploadDisclosure: monster.config.whitelabel.showMediaUploadDisclosure,
						silenceMedia: silenceMediaId,
						mediaList: medias,
						media: 'music_on_hold' in account && 'media_id' in account.music_on_hold ? account.music_on_hold.media_id : undefined
					},
					popupTemplate = $(self.getTemplate({
						name: 'musicOnHoldPopup',
						data: templateData,
						submodule: 'myOffice'
					})),
					popup = monster.ui.dialog(popupTemplate, {
						title: self.i18n.active().myOffice.musicOnHold.title,
						position: ['center', 20]
					});

				self.myOfficeMusicOnHoldPopupBindEvents({
					popupTemplate: popupTemplate,
					popup: popup,
					account: account
				});
			});
		},

		myOfficeMusicOnHoldPopupBindEvents: function(args) {
			var self = this,
				popupTemplate = args.popupTemplate,
				popup = args.popup,
				account = args.account,
				closeUploadDiv = function(newMedia) {
					mediaToUpload = undefined;
					popupTemplate.find('.upload-div input').val('');
					popupTemplate.find('.upload-div').slideUp(function() {
						popupTemplate.find('.upload-toggle').removeClass('active');
					});
					if (newMedia) {
						var mediaSelect = popupTemplate.find('.media-dropdown');
						mediaSelect.append('<option value="' + newMedia.id + '">' + newMedia.name + '</option>');
						mediaSelect.val(newMedia.id);
					}
				},
				mediaToUpload;

			popupTemplate.find('.upload-input').fileUpload({
				inputOnly: true,
				wrapperClass: 'file-upload input-append',
				btnText: self.i18n.active().myOffice.musicOnHold.audioUploadButton,
				btnClass: 'monster-button',
				maxSize: 5,
				success: function(results) {
					mediaToUpload = results[0];
				},
				error: function(errors) {
					if (errors.hasOwnProperty('size') && errors.size.length > 0) {
						monster.ui.alert(self.i18n.active().myOffice.musicOnHold.fileTooBigAlert);
					}
					popupTemplate.find('.upload-div input').val('');
					mediaToUpload = undefined;
				}
			});

			popupTemplate.find('.cancel-link').on('click', function() {
				popup.dialog('close').remove();
			});

			popupTemplate.find('.upload-toggle').on('click', function() {
				if ($(this).hasClass('active')) {
					popupTemplate.find('.upload-div').stop(true, true).slideUp();
				} else {
					popupTemplate.find('.upload-div').stop(true, true).slideDown();
				}
			});

			popupTemplate.find('.upload-cancel').on('click', function() {
				closeUploadDiv();
			});

			popupTemplate.find('.upload-submit').on('click', function() {
				if (mediaToUpload) {
					self.callApi({
						resource: 'media.create',
						data: {
							accountId: self.accountId,
							data: {
								streamable: true,
								name: mediaToUpload.name,
								media_source: 'upload',
								description: mediaToUpload.name
							}
						},
						success: function(data, status) {
							var media = data.data;
							self.callApi({
								resource: 'media.upload',
								data: {
									accountId: self.accountId,
									mediaId: media.id,
									data: mediaToUpload.file
								},
								success: function(data, status) {
									closeUploadDiv(media);
								},
								error: function(data, status) {
									self.callApi({
										resource: 'media.delete',
										data: {
											accountId: self.accountId,
											mediaId: media.id,
											data: {}
										},
										success: function(data, status) {}
									});
								}
							});
						}
					});
				} else {
					monster.ui.alert(self.i18n.active().myOffice.musicOnHold.emptyUploadAlert);
				}
			});

			popupTemplate.find('.save').on('click', function() {
				var selectedMedia = popupTemplate.find('.media-dropdown option:selected').val();

				if (!('music_on_hold' in account)) {
					account.music_on_hold = {};
				}

				if (selectedMedia && selectedMedia.length > 0) {
					account.music_on_hold = {
						media_id: selectedMedia
					};
				} else {
					account.music_on_hold = {};
				}
				self.myOfficeUpdateAccount(account, function(updatedAccount) {
					popup.dialog('close').remove();
				});
			});
		},

		myOfficeRenderCallerIdPopup: function(args) {
			var self = this,
				parent = args.parent,
				myOfficeData = args.myOfficeData,
				templateData = {
					isE911Enabled: monster.util.isNumberFeatureEnabled('e911'),
					mainNumbers: myOfficeData.mainNumbers,
					selectedMainNumber: 'caller_id' in myOfficeData.account && 'external' in myOfficeData.account.caller_id ? myOfficeData.account.caller_id.external.number || 'none' : 'none'
				},
				popupTemplate = $(self.getTemplate({
					name: 'callerIdPopup',
					data: templateData,
					submodule: 'myOffice'
				})),
				popup = monster.ui.dialog(popupTemplate, {
					title: self.i18n.active().myOffice.callerId.title,
					position: ['center', 20]
				});

			if (monster.util.isNumberFeatureEnabled('e911')) {
				var e911Form = popupTemplate.find('.emergency-form > form');

				monster.ui.validate(e911Form, {
					messages: {
						'postal_code': {
							required: '*'
						},
						'street_address': {
							required: '*'
						},
						'locality': {
							required: '*'
						},
						'region': {
							required: '*'
						}
					}
				});

				monster.ui.valid(e911Form);
			}

			self.myOfficeCallerIdPopupBindEvents({
				parent: parent,
				popupTemplate: popupTemplate,
				popup: popup,
				account: myOfficeData.account
			});
		},

		myOfficeCallerIdPopupBindEvents: function(args) {
			var self = this,
				parent = args.parent,
				popupTemplate = args.popupTemplate,
				popup = args.popup,
				account = args.account,
				callerIdNumberSelect = popupTemplate.find('.caller-id-select'),
				callerIdNameInput = popupTemplate.find('.caller-id-name'),
				emergencyZipcodeInput = popupTemplate.find('.caller-id-emergency-zipcode'),
				emergencyAddress1Input = popupTemplate.find('.caller-id-emergency-address1'),
				emergencyAddress2Input = popupTemplate.find('.caller-id-emergency-address2'),
				emergencyCityInput = popupTemplate.find('.caller-id-emergency-city'),
				emergencyStateInput = popupTemplate.find('.caller-id-emergency-state'),
				loadNumberDetails = function(number, popupTemplate) {
					var allowedFeatures = [],
						callback = function(features) {
							popupTemplate.find('.number-feature').hide();
							_.each(features, function(featureName) {
								popupTemplate.find('.number-feature[data-feature="' + featureName + '"]').slideDown();
							});
						};

					if (number) {
						self.myOfficeGetNumber(number, function(numberData) {
							var availableFeatures = numberData.hasOwnProperty('_read_only') && numberData._read_only.hasOwnProperty('features_available') ? numberData._read_only.features_available : [],
								activatedFeatures = numberData.hasOwnProperty('_read_only') && numberData._read_only.hasOwnProperty('features') ? numberData._read_only.features : [],
								allFeatures = availableFeatures.concat(activatedFeatures),
								hasE911 = allFeatures.indexOf('e911') >= 0,
								hasCNAM = allFeatures.indexOf('cnam') >= 0;

							if (hasE911) {
								if (monster.util.isNumberFeatureEnabled('e911')) {
									allowedFeatures.push('e911');

									if ('e911' in numberData) {
										emergencyZipcodeInput.val(numberData.e911.postal_code);
										emergencyAddress1Input.val(numberData.e911.street_address);
										emergencyAddress2Input.val(numberData.e911.extended_address);
										emergencyCityInput.val(numberData.e911.locality);
										emergencyStateInput.val(numberData.e911.region);
									} else {
										emergencyZipcodeInput.val('');
										emergencyAddress1Input.val('');
										emergencyAddress2Input.val('');
										emergencyCityInput.val('');
										emergencyStateInput.val('');
									}
								}
							}

							if (hasCNAM) {
								allowedFeatures.push('cnam');

								if ('cnam' in numberData) {
									callerIdNameInput.val(numberData.cnam.display_name);
								} else {
									callerIdNameInput.val('');
								}
							}

							callback && callback(allowedFeatures);
						});
					} else {
						callback && callback(allowedFeatures);
					}
				};

			popupTemplate.find('.cancel-link').on('click', function() {
				popup.dialog('close').remove();
			});

			callerIdNumberSelect.on('change', function() {
				loadNumberDetails($(this).val(), popupTemplate);
			});

			emergencyZipcodeInput.on('blur', function() {
				var zipCode = $(this).val();

				if (zipCode) {
					self.myOfficeGetAddessFromZipCode({
						data: {
							zipCode: zipCode
						},
						success: function(results) {
							if (!_.isEmpty(results)) {
								var length = results[0].address_components.length;
								emergencyCityInput.val(results[0].address_components[1].long_name);
								emergencyStateInput.val(results[0].address_components[length - 2].short_name);
							}
						}
					});
				}
			});

			popupTemplate.find('.save').on('click', function() {
				var callerIdNumber = callerIdNumberSelect.val(),
					updateAccount = function() {
						self.myOfficeUpdateAccount(account, function(updatedAccount) {
							popup.dialog('close').remove();
							self.myOfficeRender({
								parent: parent
							});
						});
					},
					setNumberData = function(e911Data) {
						var callerIdName = callerIdNameInput.val(),
							setCNAM = popupTemplate.find('.number-feature[data-feature="cnam"]').is(':visible'),
							setE911 = popupTemplate.find('.number-feature[data-feature="e911"]').is(':visible');

						account.caller_id = $.extend(true, {}, account.caller_id, {
							external: {
								number: callerIdNumber
							},
							emergency: {
								number: callerIdNumber
							}
						});

						if (setCNAM) {
							account.caller_id = $.extend(true, {}, account.caller_id, {
								external: {
									name: callerIdName
								}
							});
						}

						self.myOfficeGetNumber(callerIdNumber, function(numberData) {
							if (setCNAM && callerIdName.length) {
								$.extend(true, numberData, { cnam: { display_name: callerIdName } });
							} else {
								delete numberData.cnam;
							}

							if (setE911) {
								$.extend(true, numberData, {
									e911: e911Data
								});
							} else {
								delete numberData.e911;
							}

							self.myOfficeUpdateNumber(numberData, function(data) {
								updateAccount();
							});
						});
					},
					e911Form;

				if (monster.util.isNumberFeatureEnabled('e911')) {
					e911Form = popupTemplate.find('.emergency-form > form');
				}

				if (callerIdNumber) {
					if (monster.util.isNumberFeatureEnabled('e911')) {
						if (monster.ui.valid(e911Form)) {
							var e911Data = monster.ui.getFormData(e911Form[0]);

							setNumberData(e911Data);
						} else {
							monster.ui.alert(self.i18n.active().myOffice.callerId.mandatoryE911Alert);
						}
					} else {
						setNumberData();
					}
				} else {
					delete account.caller_id.external;
					delete account.caller_id.emergency;
					updateAccount();
				}
			});

			loadNumberDetails(callerIdNumberSelect.val(), popupTemplate);
		},

		myOfficeWalkthroughRender: function() {
			var self = this;

			if (self.isActive()) {
				// First we check if the user hasn't seen the walkthrough already
				// if he hasn't we show the walkthrough, and once they're done with it, we update their user doc so they won't see the walkthrough again
				self.myOfficeHasWalkthrough(function() {
					self.myOfficeShowWalkthrough(function() {
						self.myOfficeUpdateWalkthroughFlagUser();
					});
				});
			}
		},

		myOfficeHasWalkthrough: function(callback) {
			var self = this,
				flag = self.uiFlags.user.get('showDashboardWalkthrough');

			if (flag !== false) {
				callback && callback();
			}
		},

		// Triggers firstUseWalkthrough. First we render the dropdown, then we show a greeting popup, and once they click go, we render the step by step.
		myOfficeShowWalkthrough: function(callback) {
			var self = this,
				mainTemplate = $('#voip_container'),
				steps = [
					{
						element: mainTemplate.find('.category#myOffice')[0],
						intro: self.i18n.active().myOffice.walkthrough.steps['1'],
						position: 'right'
					},
					{
						element: mainTemplate.find('.category#users')[0],
						intro: self.i18n.active().myOffice.walkthrough.steps['2'],
						position: 'right'
					},
					{
						element: mainTemplate.find('.category#groups')[0],
						intro: self.i18n.active().myOffice.walkthrough.steps['3'],
						position: 'right'
					},
					{
						element: mainTemplate.find('.category#strategy')[0],
						intro: self.i18n.active().myOffice.walkthrough.steps['4'],
						position: 'right'
					}
				];

			monster.ui.stepByStep(steps, function() {
				callback && callback();
			});
		},

		myOfficeUpdateWalkthroughFlagUser: function(callback) {
			var self = this,
				userToSave = self.uiFlags.user.set('showDashboardWalkthrough', false);

			self.myOfficeUpdateOriginalUser(userToSave, function(user) {
				callback && callback(user);
			});
		},

		/* API Calls */
		myOfficeGetNumber: function(number, success, error) {
			var self = this;

			self.callApi({
				resource: 'numbers.get',
				data: {
					accountId: self.accountId,
					phoneNumber: encodeURIComponent(number)
				},
				success: function(data, status) {
					success && success(data.data);
				},
				error: function(data, status) {
					error && error(data);
				}
			});
		},

		myOfficeUpdateNumber: function(numberData, success, error) {
			var self = this;

			self.callApi({
				resource: 'numbers.update',
				data: {
					accountId: self.accountId,
					phoneNumber: encodeURIComponent(numberData.id),
					data: numberData
				},
				success: function(data, status) {
					success && success(data.data);
				},
				error: function(data, status) {
					error && error(data);
				}
			});
		},

		myOfficeListMedias: function(callback) {
			var self = this;

			self.callApi({
				resource: 'media.list',
				data: {
					accountId: self.accountId,
					filters: {
						key_missing: 'type'
					}
				},
				success: function(medias) {
					callback && callback(medias.data);
				}
			});
		},

		myOfficeUpdateAccount: function(account, callback) {
			var self = this;

			delete account.extra;

			self.callApi({
				resource: 'account.update',
				data: {
					accountId: self.accountId,
					data: account
				},
				success: function(data) {
					callback && callback(data.data);
				}
			});
		},

		myOfficeUpdateOriginalUser: function(userToUpdate, callback) {
			var self = this;

			self.callApi({
				resource: 'user.update',
				data: {
					userId: userToUpdate.id,
					accountId: monster.apps.auth.originalAccount.id,
					data: userToUpdate
				},
				success: function(savedUser) {
					callback && callback(savedUser.data);
				}
			});
		},

		myOfficeGetAddessFromZipCode: function(args) {
			var self = this;

			monster.request({
				resource: 'google.geocode.address',
				data: args.data,
				success: function(data, status) {
					args.hasOwnProperty('success') && args.success(data.results);
				},
				error: function(errorPayload, data, globalHandler) {
					args.hasOwnProperty('error') ? args.error() : globalHandler(data, { generateError: true });
				}
			});
		}
	};

	return app;
});
