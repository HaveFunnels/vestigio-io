export type Menu = {
	id: number;
	titleKey: string;
	newTab?: boolean;
	path?: string;
	submenu?: Submenu[];
};

export type Submenu = {
	id: number;
	titleKey: string;
	newTab?: boolean;
	path: string;
};
