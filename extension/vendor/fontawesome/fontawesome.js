"use strict";

fetch(chrome.runtime.getURL("/vendor/fontawesome/fontawesome.css"))
	.then((response) => response.text())
	.then((css) => {
		css = css.replace(/\.\.\/webfonts\/[^)]+/g, (match) => {
			match = match.substring(2, match.length);

			return chrome.runtime.getURL(`/vendor/fontawesome${match}`);
		});

		const style = document.createElement("style");
		style.innerHTML = css;

		document.querySelector("head").appendChild(style);
	});
