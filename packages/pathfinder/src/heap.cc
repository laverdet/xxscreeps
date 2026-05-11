export module screeps:heap;
import std;

constexpr auto k_max_rooms = 64;

//
// Priority queue implementation w/ support for updating priorities
template <class Key, class Priority, std::size_t Capacity>
class heap_t {
	public:
		heap_t() = default;

		[[nodiscard]] auto empty() const -> bool {
			return size_ == 0;
		}

		auto priority(Key index) const -> Priority {
			return priorities[ index ];
		}

		auto pop() -> std::pair<Key, Priority> {
			std::pair<Key, Priority> ret(heap[ 1 ], priorities[ heap[ 1 ] ]);
			heap[ 1 ] = heap[ size_ ];
			--size_;
			std::size_t vv = 1;
			do {
				std::size_t uu = vv;
				if ((uu << 1) + 1 <= size_) {
					if (priorities[ heap[ uu ] ] >= priorities[ heap[ uu << 1 ] ]) {
						vv = uu << 1;
					}
					if (priorities[ heap[ vv ] ] >= priorities[ heap[ (uu << 1) + 1 ] ]) {
						vv = (uu << 1) + 1;
					}
				} else if (uu << 1 <= size_) {
					if (priorities[ heap[ uu ] ] >= priorities[ heap[ uu << 1 ] ]) {
						vv = uu << 1;
					}
				}
				if (uu != vv) {
					std::swap(heap[ uu ], heap[ vv ]);
				} else {
					break;
				}
			} while (true);
			return ret;
		}

		void insert(Key index, Priority priority) {
			if (size_ == heap.size() - 1) {
				throw std::runtime_error("Max heap");
			}
			priorities[ index ] = priority;
			++size_;
			heap[ size_ ] = index;
			bubble_up(size_);
		}

		void update(Key index, Priority priority) {
			for (std::size_t ii = size_; ii > 0; --ii) {
				if (heap[ ii ] == index) {
					priorities[ index ] = priority;
					bubble_up(ii);
					return;
				}
			}
		}

		void bubble_up(std::size_t ii) {
			while (ii != 1) {
				if (priorities[ heap[ ii ] ] <= priorities[ heap[ ii >> 1 ] ]) {
					std::swap(heap[ ii ], heap[ ii >> 1 ]);
					ii = ii >> 1;
				} else {
					return;
				}
			}
		}

		void clear() {
			size_ = 0;
		}

	private:
		std::array<Priority, Capacity> priorities;
		// Theoretical max number of open nodes is total node divided by 8. 1 node opens all its
		// neighbors repeated perfectly over the whole graph. It's impossible to actually hit this limit
		// with a regular pathfinder operation
		std::array<Key, 2'500 * k_max_rooms / 8> heap;
		std::size_t size_ = 0;
};
