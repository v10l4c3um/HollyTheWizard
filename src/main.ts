import React from "react";
import { render } from "ink";
import { InkApp } from "./ui/ink/InkApp";
import { engineFactory, locationNameResolver } from "./bootstrap/engineFactory";

// ─── Entry point ────────────────────────────────────────────────────────────
render(
	React.createElement(InkApp, {
		engineFactory,
		locationNameResolver,
	}),
);
