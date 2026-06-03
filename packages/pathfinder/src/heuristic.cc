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

		constexpr auto reset(std::vector<goal_t> goals, bool flee) -> void {
			this->goals_ = std::move(goals);
			if (goals_.size() == 1) {
				one_goal_ = goals_[ 0 ];
				callback_ = flee ? &heuristic_t::flee_one : &heuristic_t::forward_one;
			} else {
				callback_ = flee ? &heuristic_t::flee_n : &heuristic_t::forward_n;
			}
		}

		// Returns the minimum Chebyshev distance to a goal
		constexpr auto operator()(world_position_t pos) const -> cost_t {
			return (this->*callback_)(pos);
		}

		constexpr auto operator()(indexed_position_t pos) const -> cost_t {
			// NOLINTNEXTLINE(cppcoreguidelines-slicing)
			return (*this)(world_position_t{pos});
		}

	private:
		[[nodiscard]] constexpr auto flee_n(world_position_t pos) const -> cost_t {
			return std::ranges::fold_left(goals_, cost_t{0}, [ & ](cost_t cost, goal_t goal) -> cost_t {
				auto dist = pos.range_to(goal.pos);
				return dist < goal.range ? std::max(cost, goal.range - dist) : cost;
			});
		}

		[[nodiscard]] constexpr auto flee_one(world_position_t pos) const -> cost_t {
			auto dist = pos.range_to(one_goal_.pos);
			return dist < one_goal_.range ? one_goal_.range - dist : 0;
		}

		[[nodiscard]] constexpr auto forward_n(world_position_t pos) const -> cost_t {
			return std::ranges::fold_left(goals_, std::numeric_limits<cost_t>::max(), [ & ](cost_t cost, goal_t goal) -> cost_t {
				auto dist = pos.range_to(goal.pos);
				return (dist > goal.range) ? std::min(cost, dist - goal.range) : 0;
			});
		}

		[[nodiscard]] constexpr auto forward_one(world_position_t pos) const -> cost_t {
			auto dist = pos.range_to(one_goal_.pos);
			return (dist > one_goal_.range) ? dist - one_goal_.range : 0;
		}

		using callback_type = auto (heuristic_t::*)(world_position_t) const -> cost_t;

		callback_type callback_;
		std::vector<goal_t> goals_;
		goal_t one_goal_;
};

} // namespace screeps
