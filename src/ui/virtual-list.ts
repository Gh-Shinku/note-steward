export interface VirtualRange {
	start: number;
	end: number;
	paddingBefore: number;
	paddingAfter: number;
}

export function getVirtualRange(
	itemCount: number,
	scrollTop: number,
	viewportHeight: number,
	itemHeight: number,
	overscan = 5,
): VirtualRange {
	const effectiveHeight =
		viewportHeight > 0 ? viewportHeight : itemHeight * 10;
	const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
	const end = Math.min(
		itemCount,
		Math.ceil((scrollTop + effectiveHeight) / itemHeight) + overscan,
	);
	return {
		start,
		end,
		paddingBefore: start * itemHeight,
		paddingAfter: (itemCount - end) * itemHeight,
	};
}
