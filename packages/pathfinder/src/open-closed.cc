export module screeps:open_closed;
import std;

namespace screeps {

// Simple open-closed list
template <std::size_t capacity>
class open_closed_t {
	public:
		void clear() {
			if (std::numeric_limits<marker_t>::max() - 2 <= marker) {
				std::fill(list.begin(), list.end(), 0);
				marker = 1;
			} else {
				marker += 2;
			}
		}

		auto is_open(std::size_t index) const -> bool {
			return list[ index ] == marker;
		}

		auto is_closed(std::size_t index) const -> bool {
			return list[ index ] == marker + 1;
		}

		void open(std::size_t index) {
			list[ index ] = marker;
		}

		void close(std::size_t index) {
			list[ index ] = marker + 1;
		}

	private:
		using marker_t = std::uint32_t;
		std::array<marker_t, capacity> list{};
		marker_t marker = 1;
};

}; // namespace screeps
