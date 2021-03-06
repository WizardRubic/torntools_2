"use strict";

let pendingActions = {};

(async () => {
	await loadDatabase();
	console.log("TT: Items - Loading script. ");

	storageListeners.settings.push(loadItems);
	loadItems();

	loadItemsOnce();

	console.log("TT: Items - Script loaded.");
})();

function loadItems() {
	requireContent().then(() => {
		loadQuickItems().catch((error) => console.error("Couldn't load the quick items.", error));
	});
	requireItemsLoaded().then(() => {
		initializeItems();
	});
}

function loadItemsOnce() {
	document.addEventListener("click", (event) => {
		if (event.target.classList.contains("close-act")) {
			const responseWrap = findParent(event.target, { class: "response-wrap" });

			if (responseWrap) responseWrap.style.display = "none";
		}
	});
	setInterval(() => {
		for (let timer of document.findAll(".counter-wrap.tt-modified")) {
			let secondsLeft;
			if ("secondsLeft" in timer.dataset) secondsLeft = parseInt(timer.dataset.secondsLeft);
			else secondsLeft = parseInt(timer.dataset.time);
			secondsLeft--;

			timer.innerText = formatTime({ seconds: secondsLeft }, { type: "timer" });

			timer.dataset.secondsLeft = `${secondsLeft}`;
		}
	}, 1000);

	addXHRListener((event) => {
		const { page, json, xhr, uri } = event.detail;

		if (page === "item") {
			const params = new URLSearchParams(xhr.requestBody);
			const step = params.get("step");

			if (json && step === "useItem") {
				if (!json.success) return;

				if (params.get("step") !== "useItem") return;
				if (params.has("fac") && params.get("fac") !== "0") return;

				if (json.items) {
					for (const item of json.items.itemAppear) {
						updateItemAmount(parseInt(item.ID), parseInt(item.qty));
					}
					for (const item of json.items.itemDisappear) {
						updateItemAmount(parseInt(item.ID), -parseInt(item.qty));
					}
				} else {
					updateItemAmount(parseInt(params.get("itemID")), -1);
				}
			} else if (json && step === "sendItemAction") {
				if (!json.success) return;

				const actionId = json.confirm ? json.itemID : params.get("XID");
				const item = json.confirm ? params.get("itemID") : pendingActions[actionId].item;
				const amount = json.amount;

				if (json.confirm) pendingActions[actionId] = { item };
				else {
					delete pendingActions[actionId];

					updateItemAmount(item, -amount);
				}
			} else if (json && (step === "getCategoryList" || step === "getNotAllItemsListWithoutGroups" || step === "getItemsListByItemId")) {
				const tab = document.find("ul.items-cont.tab-menu-cont[style='display: block;'], ul.items-cont.tab-menu-cont:not([style])");
				if (!tab) return;

				new MutationObserver((mutations, observer) => {
					if (document.find("li.ajax-item-loader")) return;

					highlightBloodBags().catch((error) => console.error("Couldn't highlight the correct blood bags.", error));
					showItemValues().catch((error) => console.error("Couldn't show the item values.", error));
					showItemMarketIcons().catch((error) => console.error("Couldn't show the market icons.", error));
					updateXIDs().catch(() => {});

					observer.disconnect();
				}).observe(tab, { subtree: true, childList: true });
			} else if (step === "actionForm") {
				const action = params.get("action");

				if (action === "equip" && hasAPIData()) {
					const responseElement = document.newElement({ html: xhr.response });
					const text = responseElement.find("h5, [data-status]").innerText.trim();

					const regexResult = text.match(/You (unequipped|equipped) your (.*)\./i);
					if (regexResult) {
						const itemName = regexResult[2];
						const equipAction = regexResult[1];

						const item = findItemsInObject(torndata.items, { name: itemName }, { single: true });
						if (!item) return;

						const equipPosition = getEquipPosition(item.id, item.type);
						[...document.findAll(`.item.equipped[data-equip-position="${equipPosition}"]`)].forEach((x) => x.classList.remove("equipped"));

						if (equipAction === "equipped" && document.find(`.item[data-id="${item.id}"]`))
							document.find(`.item[data-id="${item.id}"]`).classList.add("equipped");
					}
				}
			}
		} else if (page === "inventory" && json) {
			DRUG_DETAILS.handleInventoryRequest(xhr, json);
		}
	});

	requireItemsLoaded().then(() => {
		for (let icon of document.findAll("ul[role=tablist] li:not(.no-items):not(.m-show):not(.hide)")) {
			icon.addEventListener("click", () => requireItemsLoaded().then(initializeItems));
		}
	});
}

function requireItemsLoaded() {
	return requireElement(".items-cont[aria-expanded=true] > li > .title-wrap");
}

function initializeItems() {
	setupQuickDragListeners().catch((error) => console.error("Couldn't make the items draggable for quick items.", error));
	highlightBloodBags().catch((error) => console.error("Couldn't highlight the correct blood bags.", error));
	showItemValues().catch((error) => console.error("Couldn't show the item values.", error));
	showItemMarketIcons().catch((error) => console.error("Couldn't show the market icons.", error));
	MISSING_ITEMS.showFlowers((error) => console.error("Couldn't show the missing flowers.", error)).catch();
	MISSING_ITEMS.showPlushies((error) => console.error("Couldn't show the missing plushies.", error)).catch();
}

async function loadQuickItems() {
	if (settings.pages.items.quickItems) {
		const { content, options } = createContainer("Quick Items", {
			nextElement: document.find(".equipped-items-wrap"),
			spacer: true,
			allowDragging: true,
		});
		content.appendChild(document.newElement({ type: "div", class: "inner-content" }));
		content.appendChild(document.newElement({ type: "div", class: "response-wrap" }));
		options.appendChild(
			document.newElement({
				type: "div",
				class: "option",
				id: "edit-items-button",
				children: [document.newElement({ type: "i", class: "fas fa-plus" }), " Add"],
				events: {
					click: (event) => {
						event.stopPropagation();

						document.find("ul.items-cont[aria-expanded='true']").classList.toggle("tt-overlay-item");
						options.find("#edit-items-button").classList.toggle("tt-overlay-item");
						if (document.find(".tt-overlay").classList.toggle("hidden")) {
							for (let item of document.findAll("ul.items-cont[aria-expanded='true'] > li")) {
								if (!allowQuickItem(parseInt(item.dataset.item), item.dataset.category)) continue;

								item.removeEventListener("click", onItemClickQuickEdit);
							}
						} else {
							for (let item of document.findAll("ul.items-cont[aria-expanded='true'] > li")) {
								if (!allowQuickItem(parseInt(item.dataset.item), item.dataset.category)) continue;

								item.addEventListener("click", onItemClickQuickEdit);
							}
						}
					},
				},
			})
		);

		for (const quickItem of quick.items) {
			addQuickItem(quickItem, false);
		}
	} else {
		removeContainer("Quick Items");
	}
}

function addQuickItem(data, temporary = false) {
	const content = findContainer("Quick Items", { selector: ".content" });
	const innerContent = content.find(".inner-content");
	const responseWrap = content.find(".response-wrap");

	const { id, xid } = data;

	if (innerContent.find(`.item[data-id='${id}']`)) return;
	if (!allowQuickItem(id, torndata.items[id].type)) return;

	let equipPosition;
	if (isEquipable(id, torndata.items[id].type)) {
		equipPosition = getEquipPosition(id, torndata.items[id].type);
		data.equipPosition = equipPosition;
	}

	let itemWrap = document.newElement({
		type: "div",
		class: temporary ? "temp item" : "item",
		dataset: data,
		events: {
			click: () => {
				const data = isEquipable(id, torndata.items[id].type)
					? { step: "actionForm", confirm: 1, action: "equip", id: xid }
					: { step: "useItem", id: id, itemID: id };

				getAction({
					type: "post",
					action: "item.php",
					data,
					success: (str) => {
						if (JSON.isValid(str)) {
							const response = JSON.parse(str);

							const links = ["<a href='#' class='close-act t-blue h'>Close</a>"];
							if (response.links) {
								for (let link of response.links) {
									links.push(`<a class="t-blue h m-left10 ${link.class}" href="${link.url}" ${link.attr}>${link.title}</a>`);
								}
							}

							responseWrap.style.display = "block";
							responseWrap.innerHTML = `
								<div class="action-wrap use-act use-action">
									<form data-action="useItem" method="post">
										<p>${response.text}</p>
										<p>${links.join("")}</p>
										<div class="clear"></div>
									</form>
								</div>
							`;

							for (let count of responseWrap.findAll(".counter-wrap")) {
								count.classList.add("tt-modified");
								count.innerText = formatTime({ seconds: parseInt(count.dataset.time) }, { type: "timer" });
							}

							if (response.items) {
								for (const item of response.items.itemAppear) {
									updateItemAmount(parseInt(item.ID), parseInt(item.qty));
								}
								for (const item of response.items.itemDisappear) {
									updateItemAmount(parseInt(item.ID), -parseInt(item.qty));
								}
							} else {
								updateItemAmount(id, -1);
							}
						} else {
							responseWrap.style.display = "block";
							responseWrap.innerHTML = str;

							[...innerContent.findAll(`.item.equipped[data-equip-position="${equipPosition}"]`)].forEach((x) => x.classList.remove("equipped"));

							if (str.includes(" equipped ")) {
								[...innerContent.findAll(`.item.equipped[data-equip-position="${equipPosition}"]`)].forEach((x) =>
									x.classList.remove("equipped")
								);
								itemWrap.classList.add("equipped");
							} else if (str.includes(" unequipped "))
								[...innerContent.findAll(`.item.equipped[data-equip-position="${equipPosition}"]`)].forEach((x) =>
									x.classList.remove("equipped")
								);
						}
					},
				});
			},
		},
	});
	itemWrap.appendChild(document.newElement({ type: "div", class: "pic", attributes: { style: `background-image: url(/images/items/${id}/medium.png)` } }));
	if (hasAPIData()) {
		itemWrap.appendChild(document.newElement({ type: "div", class: "text", text: torndata.items[id].name }));

		if (settings.apiUsage.user.inventory) {
			const inventoryItem = findItemsInList(userdata.inventory, { ID: id }, { single: true });
			const amount = inventoryItem ? inventoryItem.quantity : 0;

			itemWrap.appendChild(document.newElement({ type: "div", class: "sub-text quantity", attributes: { quantity: amount }, text: amount + "x" }));

			if (inventoryItem.equipped) itemWrap.classList.add("equipped");
		}
	} else {
		itemWrap.appendChild(document.newElement({ type: "div", class: "text", text: id }));
	}
	itemWrap.appendChild(
		document.newElement({
			type: "i",
			class: "fas fa-times tt-close-icon",
			events: {
				click: async (event) => {
					event.stopPropagation();
					itemWrap.remove();

					await saveQuickItems();
				},
			},
		})
	);
	innerContent.appendChild(itemWrap);
}

function allowQuickItem(id, category) {
	return (
		["Medical", "Drug", "Energy Drink", "Alcohol", "Candy", "Booster"].includes(category) ||
		[
			// Temporary Items
			220,
			221,
			222,
			226,
			229,
			239,
			242,
			246,
			256,
			257,
			392,
			394,
			581,
			611,
			616,
			742,
			833,
			840,
			1042,
			// Others
			403,
		].includes(id)
	);
}

function isEquipable(id, category) {
	return ["Temporary"].includes(category);
}

function getEquipPosition(id, category) {
	// 4 = Body Armor
	// 6 = Helmet
	// 7 = Pants
	// 8 = Boots
	// 9 = Gloves
	// 10 = CLOTHING - Jacket
	switch (category) {
		case "Primary":
			return 1;
		case "Secondary":
			return 2;
		case "Melee":
			return 3;
		case "Temporary":
			return 5;
		case "Defensive":
			return -1; // TODO - Get right position;
		default:
			return false;
	}
}

async function saveQuickItems() {
	const content = findContainer("Quick Items", { selector: ".content" });

	await ttStorage.change({
		quick: {
			items: [...content.findAll(".item")].map((x) => {
				let data = { id: parseInt(x.dataset.id) };
				if (x.dataset.xid) data.xid = x.dataset.xid;

				return data;
			}),
		},
	});
}

async function setupQuickDragListeners() {
	for (let item of document.findAll(".items-cont[aria-expanded=true] > li[data-item]")) {
		if (!allowQuickItem(parseInt(item.dataset.item), item.dataset.category)) continue;

		const titleWrap = item.find(".title-wrap");

		titleWrap.setAttribute("draggable", "true");
		titleWrap.addEventListener("dragstart", onDragStart);
		titleWrap.addEventListener("dragend", onDragEnd);
	}

	function onDragStart(event) {
		event.dataTransfer.setData("text/plain", null);

		setTimeout(() => {
			document.find("#quickItems .content").classList.add("drag-progress");
			if (document.find("#quickItems .temp.item")) return;

			const id = parseInt(event.target.parentElement.dataset.item);

			let data = { id };
			if (isEquipable(id, event.target.parentElement.dataset.category)) {
				data.xid = parseInt(event.target.parentElement.find(".actions[xid]").getAttribute("xid"));
			}

			addQuickItem(data, true);
			// enableInjectListener();
		}, 10);
	}

	async function onDragEnd() {
		if (document.find("#quickItems .temp.item")) {
			document.find("#quickItems .temp.item").remove();
		}

		document.find("#quickItems .content").classList.remove("drag-progress");

		await saveQuickItems();
	}
}

async function onItemClickQuickEdit(event) {
	event.stopPropagation();
	event.preventDefault();

	const target = findParent(event.target, { hasAttribute: "data-item" });
	const id = parseInt(target.dataset.item);

	let data = { id };
	if (isEquipable(id, target.dataset.category)) {
		data.xid = parseInt(target.find(".actions[xid]").getAttribute("xid"));
	}

	addQuickItem(data, false);

	await saveQuickItems();
}

function updateItemAmount(id, change) {
	const quickQuantity = findContainer("Quick Items", { selector: `.item[data-id="${id}"] .quantity` });
	if (quickQuantity) {
		let newQuantity = parseInt(quickQuantity.getAttribute("quantity")) + change;

		quickQuantity.innerText = newQuantity + "x";
		quickQuantity.setAttribute("quantity", newQuantity);
	}

	for (const item of document.findAll(`.items-cont > li[data-item="${id}"]`)) {
		const priceElement = item.find(".tt-item-price");
		if (!priceElement) continue;
		const quantityElement = priceElement.find(".tt-item-quantity");

		let price = torndata.items[id].market_value;
		let newQuantity = parseInt(quantityElement.innerText.match(/([0-9]*)x = /i)[1]) + change;

		if (newQuantity === 1) {
			priceElement.innerHTML = "";
			priceElement.appendChild(document.newElement({ type: "span", text: `$${formatNumber(price)}` }));
		} else {
			quantityElement.innerText = `${newQuantity}x = `;
			priceElement.find("span:last-child").innerText = `$${formatNumber(price * newQuantity)}`;
		}
	}
}

async function showItemValues() {
	if (settings.pages.items.values && hasAPIData() && settings.apiUsage.user.inventory) {
		const list = document.find(".items-cont[aria-expanded=true]");
		const type = list.dataset.info;

		let total;
		if (type === "All") total = userdata.inventory.map((x) => x.quantity * x.market_price).reduce((a, b) => (a += b), 0);
		else
			total = userdata.inventory
				.filter((x) => x.type === type)
				.map((x) => x.quantity * x.market_price)
				.reduce((a, b) => (a += b), 0);

		for (let item of list.findAll(":scope > li[data-item]")) {
			const id = item.dataset.item;
			const price = torndata.items[id].market_value;

			const parent = mobile ? item.find(".name-wrap") : item.find(".bonuses-wrap") || item.find(".name-wrap");

			const quantity = parseInt(item.find(".item-amount.qty").innerText) || 1;
			const totalPrice = quantity * parseInt(price);

			if (parent.find(".tt-item-price")) continue;

			let priceElement;
			if (item.find(".bonuses-wrap")) {
				priceElement = document.newElement({ type: "li", class: "tt-item-price fl" });
			} else {
				priceElement = document.newElement({ type: "span", class: "tt-item-price" });

				if (item.find("button.group-arrow")) {
					priceElement.style.setProperty("padding-right", "30px", "important");
				}
			}
			if (mobile) {
				// priceElement.setAttribute("style", `op: 10px; float: unset !important; font-size: 11px;`);
				// parent.find(".name").setAttribute("style", "position: relative; top: -3px;");
				// parent.find(".qty").setAttribute("style", "position: relative; top: -3px;");
			}

			if (totalPrice) {
				if (quantity === 1) {
					priceElement.appendChild(document.newElement({ type: "span", text: `$${formatNumber(price)}` }));
				} else {
					priceElement.appendChild(document.newElement({ type: "span", text: `$${formatNumber(price)} | ` }));
					priceElement.appendChild(document.newElement({ type: "span", text: `${quantity}x = `, class: "tt-item-quantity" }));
					priceElement.appendChild(document.newElement({ type: "span", text: `$${formatNumber(totalPrice)}` }));
				}
			} else if (price === 0) {
				priceElement.innerText = `N/A`;
			} else {
				priceElement.innerText = `$${formatNumber(price)}`;
			}

			parent.appendChild(priceElement);
		}

		if (list.find(":scope > li > .tt-item-price")) list.find(":scope > li > .tt-item-price").parentElement.remove();

		list.insertBefore(
			document.newElement({
				type: "li",
				class: "tt-ignore",
				children: [
					document.newElement({
						type: "li",
						text: `Total Value: $${formatNumber(total, { decimals: 0 })}`,
						class: "tt-item-price",
					}),
				],
			}),
			list.firstElementChild
		);
	} else {
		for (const price of document.findAll(".tt-item-price, #category-wrap .tt-ignore")) {
			price.remove();
		}
	}
}

async function showItemMarketIcons() {
	if (settings.pages.items.marketLinks && !(await checkMobile())) {
		let isFirst = true;
		let lastItem;
		for (const item of document.findAll(".items-cont[aria-expanded=true] > li[data-item]:not(.tt-ignore):not(.ajax-placeholder)")) {
			if (item.find(".market-link")) continue;

			if (item.classList.contains("item-group")) item.classList.add("tt-modified");

			const id = parseInt(item.dataset.item);
			if (!isSellable(id)) continue;

			let parent = item.find(".outside-actions");
			if (!parent) {
				parent = document.newElement({ type: "div", class: `outside-actions ${isFirst ? "first-action" : ""}` });

				item.appendChild(parent);
			}

			const name = item.find(".thumbnail-wrap").getAttribute("aria-label");

			parent.appendChild(
				document.newElement({
					type: "div",
					class: "market-link",
					children: [
						document.newElement({
							type: "a",
							href: `https://www.torn.com/imarket.php#/p=shop&step=shop&type=&searchname=${name}`,
							children: [document.newElement({ type: "i", class: "torn-icon-item-market", attributes: { title: "Open Item Market" } })],
						}),
					],
				})
			);

			isFirst = false;
			lastItem = item;
		}
		if (lastItem && lastItem.find(".outside-actions")) lastItem.find(".outside-actions").classList.add("last-action");
	} else {
		for (const link of document.findAll(".market-link")) {
			link.remove();
		}
	}
}

async function highlightBloodBags() {
	// noinspection JSIncompatibleTypesComparison
	if (settings.pages.items.highlightBloodBags !== "none") {
		const allowedBlood = ALLOWED_BLOOD[settings.pages.items.highlightBloodBags];

		for (let item of document.findAll("ul.items-cont[aria-expanded=true] > li[data-category='Medical']")) {
			if (!item.find(".name-wrap")) continue;
			item.find(".name-wrap").classList.remove("good-blood", "bad-blood");

			if (!item.dataset.sort.includes("Blood Bag : ")) continue; // is not a filled blood bag
			if (parseInt(item.dataset.item) === 1012) continue; // is an irradiated blood bag

			item.find(".name-wrap").classList.add(allowedBlood.includes(parseInt(item.dataset.item)) ? "good-blood" : "bad-blood");
		}
	} else {
		for (let bb of document.findAll(".good-blood, .bad-blood")) {
			bb.classList.remove("good-blood", "bad-blood");
		}
	}
}

/*
 * Torn Function
 */
function getAction(options = {}) {
	options = {
		success: () => {},
		action: location.pathname,
		type: "get",
		data: {},
		async: true,
		...options,
	};

	return $.ajax({
		url: "https://www.torn.com/" + addRFC(options.action),
		type: options.type,
		data: options.data,
		async: options.async,
		success: (msg) => options.success(msg),
		error: (xhr, ajaxOptions, error) => {
			console.error("Error during action call.", error);
		},
	});
}

const MISSING_ITEMS = {
	showFlowers: async () => {
		await MISSING_ITEMS._show("needed-flowers", "#flowers-items", "missingFlowers", SETS.FLOWERS);
	},
	showPlushies: async () => {
		await MISSING_ITEMS._show("needed-plushies", "#plushies-items", "missingPlushies", SETS.PLUSHIES);
	},
	_show: async (name, categorySelector, settingName, itemSet) => {
		if (document.find(`#${name}`)) document.find(`#${name}`).remove();

		if (
			document.find(`#category-wrap > ${categorySelector}[aria-expanded='true']`) &&
			settings.pages.items[settingName] &&
			hasAPIData() &&
			settings.apiUsage.user.inventory
		) {
			const needed = itemSet.filter((x) => !userdata.inventory.some((y) => x.id === y.ID));
			if (needed.length <= 0) return;

			const wrapper = document.newElement({ type: "div", id: name });
			for (const item of needed.sort((a, b) => a.name.localeCompare(b.name))) {
				wrapper.appendChild(
					document.newElement({
						type: "div",
						class: "needed-item",
						children: [
							document.newElement({
								type: "img",
								attributes: { src: `https://www.torn.com/images/items/${item.id}/large.png`, alt: item.name },
							}),
							document.newElement({ type: "span", text: item.name }),
						],
						dataset: { id: item.id, name: item.name },
					})
				);
			}
			document.find(".main-items-cont-wrap").insertAdjacentElement("afterend", wrapper);
			showItemValuesMissingSets().catch((error) => console.error("Couldn't show item values for the missing set items.", error));
			showItemMarketIconsMissingSets().catch((error) => console.error("Couldn't show item values for the missing set items.", error));
		}
	},
};

async function showItemMarketIconsMissingSets() {
	if (settings.pages.items.marketLinks && !(await checkMobile())) {
		let isFirst = true;
		let lastItem;
		for (const item of document.findAll(".needed-item")) {
			if (item.find(".market-link")) continue;

			const id = parseInt(item.dataset.id);
			if (!isSellable(id)) continue;

			let parent = item.find(".outside-actions");
			if (!parent) {
				parent = document.newElement({ type: "div", class: `outside-actions ${isFirst ? "first-action" : ""}` });

				item.appendChild(parent);
			}

			const name = item.dataset.name;

			parent.appendChild(
				document.newElement({
					type: "div",
					class: "market-link",
					children: [
						document.newElement({
							type: "a",
							href: `https://www.torn.com/imarket.php#/p=shop&step=shop&type=&searchname=${name}`,
							children: [document.newElement({ type: "i", class: "torn-icon-item-market", attributes: { title: "Open Item Market" } })],
						}),
					],
				})
			);

			isFirst = false;
			lastItem = item;
		}
		if (lastItem && lastItem.find(".outside-actions")) lastItem.find(".outside-actions").classList.add("last-action");
	} else {
		for (const link of document.findAll(".market-link")) {
			link.remove();
		}
	}
}

async function showItemValuesMissingSets() {
	if (settings.pages.items.values && hasAPIData()) {
		for (const item of document.findAll(".needed-item")) {
			if (item.find(".tt-item-price")) continue;

			item.find(":scope > span").insertAdjacentElement(
				"afterend",
				document.newElement({
					type: "span",
					class: "tt-item-price",
					text: `$${formatNumber(torndata.items[parseInt(item.dataset.id)].market_value)}`,
				})
			);
		}
	} else {
		for (const price of document.findAll(".tt-item-price")) {
			price.remove();
		}
	}
}

async function updateXIDs() {
	const items = [...document.findAll("ul.items-cont > li .actions[xid]")].filter((x) => {
		const itemid = parseInt(x.getAttribute("itemid"));
		return quick.items.some((y) => y.id === itemid);
	});
	if (!items.length) return;

	const quickContainer = findContainer("Quick Items", { selector: ".content" });
	items.forEach((x) => {
		const itemid = parseInt(x.getAttribute("itemid"));
		const xid = x.getAttribute("xid");

		quick.items.find((y) => y.id === itemid).xid = xid;
		quickContainer.find(`.item[data-id="${itemid}"]`).dataset.xid = xid;
	});

	await ttStorage.change({ quick: { items: quick.items } });
}
