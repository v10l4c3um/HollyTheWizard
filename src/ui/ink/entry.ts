import React from "react";
import { render } from "ink";
import { InkApp } from "./InkApp";
import {
	engineFactory,
	locationNameResolver,
} from "../../bootstrap/engineFactory";

render(
	React.createElement(InkApp, {
		engineFactory,
		locationNameResolver,
	}),
);
