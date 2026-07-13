export module screeps:heuristic;
import :position;
import std;

namespace screeps {

// Destination heuristic manager
export class heuristic_t {
	public:
		struct goal_t {
				cost_t range{};
				world_position_t pos;

				constexpr static auto struct_template = js::struct_template{
					js::struct_member{util::cw<"pos">, &goal_t::pos},
					js::struct_member{util::cw<"range">, &goal_t::range},
				};
		};

		constexpr heuristic_t(goal_t goal, bool flee) :
				callback_{flee ? &heuristic_t::flee_one : &heuristic_t::forward_one},
				one_goal_{goal} {}

		constexpr heuristic_t(std::span<const goal_t> goals, bool flee) :
				callback_{flee ? &heuristic_t::flee_n : &heuristic_t::forward_n},
				goals_{goals} {}

		// Returns the minimum Chebyshev distance to a goal
		[[nodiscard]] constexpr auto operator()(world_position_t pos) const -> cost_t {
			return (this->*callback_)(pos);
		}

		[[nodiscard]] constexpr auto operator()(indexed_position_t pos) const -> cost_t {
			// NOLINTNEXTLINE(cppcoreguidelines-slicing)
			return (*this)(world_position_t{pos});
		}

		// Extract 1 or N goals from passed runtime array, avoiding `std::vector` allocation in the
		// common 1 case. `storage` owns the N goals and must outlive the returned heuristic.
		template <class Lock, class Range>
		static auto make_from_runtime(Lock& lock, Range goals, bool flee, std::vector<goal_t>& storage) -> heuristic_t {
			if (goals.size() == 1) {
				auto element = (*util::into_range(goals).begin()).second;
				return {js::transfer_out<heuristic_t::goal_t>(element, lock), flee};
			} else {
				storage = js::transfer_out<std::vector<heuristic_t::goal_t>>(goals, lock);
				return {std::span{storage}, flee};
			}
		}

	private:
		[[nodiscard]] constexpr auto flee_n(world_position_t pos) const -> cost_t {
			return std::ranges::fold_left(goals_, cost_t{0}, [ & ](cost_t cost, goal_t goal) -> cost_t {
				auto dist = pos.range_to(goal.pos);
				return dist < goal.range ? std::max(cost, goal.range - dist) : cost;
			});
		}

		[[nodiscard]] constexpr auto flee_one(world_position_t pos) const -> cost_t {
			return std::max(one_goal_.range - pos.range_to(one_goal_.pos), 0);
		}

		[[nodiscard]] constexpr auto forward_n(world_position_t pos) const -> cost_t {
			return std::ranges::fold_left(goals_, std::numeric_limits<cost_t>::max(), [ & ](cost_t cost, goal_t goal) -> cost_t {
				auto dist = pos.range_to(goal.pos);
				return (dist > goal.range) ? std::min(cost, dist - goal.range) : 0;
			});
		}

		[[nodiscard]] constexpr auto forward_one(world_position_t pos) const -> cost_t {
			return std::max(pos.range_to(one_goal_.pos) - one_goal_.range, 0);
		}

		using callback_type = auto (heuristic_t::*)(world_position_t) const -> cost_t;

		callback_type callback_;
		std::span<const goal_t> goals_;
		goal_t one_goal_;
};

} // namespace screeps
