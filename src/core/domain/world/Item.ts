class Item {
	name: string;
	description: string;
	quantity: number;

	constructor(name: string = "Item", description: string = "", quantity: number = 1) {
		this.name = name;
		this.description = description;
		this.quantity = quantity;
	}
}

export default Item;
