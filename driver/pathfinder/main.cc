// Author: Marcel Laverdet <https://github.com/laverdet>
#include <nan.h>
#include <array>
#include <memory>
#include "pf.h"

namespace screeps {

	// Init 2 Pathfinders per thread. We do 2 here because sometimes recursive calls to the path
	// finder are useful. Any more than 2 deep recursion will have to allocate a new path finder at a
	// cost of 2.16mb(!)
	thread_local std::array<path_finder_t, 2> path_finders;
	uint8_t room_info_t::cost_matrix0[2500] = { 0 };

	NAN_METHOD(search) {
		// Find an inactive path finder
		path_finder_t* pf = nullptr;
		std::unique_ptr<path_finder_t> pf_holder;
		for (auto& ii : path_finders) {
			if (!ii.is_in_use()) {
				pf = &ii;
				break;
			}
		}
		if (pf == nullptr) {
			pf_holder = std::make_unique<path_finder_t>();
			pf = pf_holder.get();
		}

		// Get the values from v8 and run the search
		cost_t plain_cost = Nan::To<uint32_t>(info[3]).FromJust();
		cost_t swamp_cost = Nan::To<uint32_t>(info[4]).FromJust();
		uint8_t max_rooms = Nan::To<uint32_t>(info[5]).FromJust();
		uint32_t max_ops = Nan::To<uint32_t>(info[6]).FromJust();
		uint32_t max_cost = Nan::To<uint32_t>(info[7]).FromJust();
		bool flee = Nan::To<bool>(info[8]).FromJust();
		double heuristic_weight = Nan::To<double>(info[9]).FromJust();
		info.GetReturnValue().Set(pf->search(
			info[0], v8::Local<v8::Array>::Cast(info[1]), // origin + goals
			v8::Local<v8::Function>::Cast(info[2]), // callback
			plain_cost, swamp_cost,
			max_rooms, max_ops, max_cost,
			flee,
			heuristic_weight
		));
	}

	NAN_METHOD(load_terrain) {
		path_finder_t::load_terrain(v8::Local<v8::Array>::Cast(info[0]));
	}
};

extern "C" IVM_DLLEXPORT void InitForContext(v8::Isolate* isolate, v8::Local<v8::Context> context, v8::Local<v8::Object> target) {
	Nan::Set(target, Nan::New("search").ToLocalChecked(), Nan::GetFunction(Nan::New<v8::FunctionTemplate>(screeps::search)).ToLocalChecked());
	Nan::Set(target, Nan::New("loadTerrain").ToLocalChecked(), Nan::GetFunction(Nan::New<v8::FunctionTemplate>(screeps::load_terrain)).ToLocalChecked());
	Nan::Set(target, Nan::New("version").ToLocalChecked(), Nan::New<v8::Number>(11));
}

NAN_MODULE_INIT(init) {
	v8::Isolate* isolate = v8::Isolate::GetCurrent();
	InitForContext(isolate, isolate->GetCurrentContext(), target);
}
NODE_MODULE(native, init);
