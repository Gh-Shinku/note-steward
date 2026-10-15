import { describe, expect, it } from 'vitest';
import { getVirtualRange } from '../src/ui/virtual-list';

describe('virtual list', () => {
	it('renders the viewport with overscan and preserves total height', () => {
		const range = getVirtualRange(1_000, 5_000, 600, 100, 2);

		expect(range).toEqual({
			start: 48,
			end: 58,
			paddingBefore: 4_800,
			paddingAfter: 94_200,
		});
	});

	it('uses a stable fallback before layout reports a viewport height', () => {
		expect(getVirtualRange(100, 0, 0, 32)).toEqual({
			start: 0,
			end: 15,
			paddingBefore: 0,
			paddingAfter: 2_720,
		});
	});
});
